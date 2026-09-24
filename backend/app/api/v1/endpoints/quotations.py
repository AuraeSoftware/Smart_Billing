import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id, require_active_tenant
from app.models.billing import Quotation, QuotationItem, QuotationStatus, Invoice, InvoiceItem
from app.models.branding import TenantBranding
from app.models.tenant import Tenant
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.schemas.billing import QuotationCreate, QuotationOut, InvoiceOut
from app.services.numbering import next_document_number
from app.services.pdf import render_document_pdf
from app.services.usage import invoices_this_month
from app.api.v1.endpoints.invoices import _compute_totals

router = APIRouter()

_MANUAL_TRANSITIONS: dict[QuotationStatus, set[QuotationStatus]] = {
    QuotationStatus.DRAFT: {QuotationStatus.SENT},
    QuotationStatus.SENT: {QuotationStatus.ACCEPTED, QuotationStatus.DECLINED, QuotationStatus.EXPIRED},
}


class StatusUpdate(BaseModel):
    status: QuotationStatus


def _compute_quote_totals(items: list[QuotationItem]) -> tuple[float, float, float, float]:
    subtotal = tax = discount = 0.0
    for it in items:
        base = float(it.quantity) * float(it.unit_price)
        disc = base * float(it.discount_percent) / 100
        taxed = (base - disc) * float(it.tax_rate_percent) / 100
        it.line_total = round(base - disc + taxed, 2)
        subtotal += base
        discount += disc
        tax += taxed
    return round(subtotal, 2), round(tax, 2), round(discount, 2), round(subtotal - discount + tax, 2)


@router.post("", response_model=QuotationOut, status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(require_active_tenant),
):
    number = next_document_number(db, tenant_id=uuid.UUID(tenant_id), doc_type="quotation", on=payload.issue_date)
    quotation = Quotation(
        tenant_id=tenant_id, number=number, customer_name=payload.customer_name,
        customer_email=payload.customer_email, issue_date=payload.issue_date,
        valid_until=payload.valid_until, notes=payload.notes, created_by=user.id,
    )
    quotation.items = [QuotationItem(**item.model_dump()) for item in payload.items]
    quotation.subtotal, quotation.tax_total, quotation.discount_total, quotation.grand_total = _compute_quote_totals(quotation.items)
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("", response_model=list[QuotationOut])
def list_quotations(
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    return db.query(Quotation).filter(Quotation.tenant_id == tenant_id).order_by(Quotation.created_at.desc()).all()


@router.post("/{quotation_id}/convert", response_model=InvoiceOut)
def convert_to_invoice(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(require_active_tenant),
):
    """One-action quotation → invoice conversion (SOW 3.1). Creates an
    invoice, so it's subject to the same monthly-limit check as a
    hand-created one."""
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id, Quotation.tenant_id == tenant_id).one_or_none()
    if quotation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quotation not found.")
    if quotation.status == QuotationStatus.CONVERTED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This quotation has already been converted.")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one()
    if tenant.subscription_plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
        if plan and invoices_this_month(db, tenant_id) >= plan.max_invoices_per_month:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Monthly invoice limit reached ({plan.max_invoices_per_month}/{plan.max_invoices_per_month} on "
                f"the {plan.name} plan). It resets at the start of next month, or contact Aurae Software "
                "Solutions to upgrade your plan.",
            )

    number = next_document_number(db, tenant_id=uuid.UUID(tenant_id), doc_type="invoice", on=quotation.issue_date)
    invoice = Invoice(
        tenant_id=tenant_id, number=number, customer_name=quotation.customer_name,
        customer_email=quotation.customer_email, issue_date=quotation.issue_date,
        source_quotation_id=quotation.id, created_by=user.id,
        notes=f"Converted from quotation {quotation.number}.",
    )
    invoice.items = [
        InvoiceItem(
            description=i.description, quantity=i.quantity, unit_price=i.unit_price,
            tax_rate_percent=i.tax_rate_percent, discount_percent=i.discount_percent,
        )
        for i in quotation.items
    ]
    invoice.subtotal, invoice.tax_total, invoice.discount_total, invoice.grand_total = _compute_totals(invoice.items)

    quotation.status = QuotationStatus.CONVERTED
    db.add(quotation)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.patch("/{quotation_id}/status", response_model=QuotationOut)
def update_quotation_status(
    quotation_id: uuid.UUID,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id, Quotation.tenant_id == tenant_id).one_or_none()
    if quotation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quotation not found.")

    allowed = _MANUAL_TRANSITIONS.get(quotation.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot move a quotation from '{quotation.status.value}' to '{payload.status.value}'.",
        )
    quotation.status = payload.status
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("/{quotation_id}/pdf")
def quotation_pdf(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id, Quotation.tenant_id == tenant_id).one_or_none()
    if quotation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quotation not found.")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one()
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()

    pdf_bytes = render_document_pdf(
        doc_type="QUOTATION", number=quotation.number, tenant_name=tenant.name, branding=branding,
        customer_name=quotation.customer_name, issue_date=quotation.issue_date.isoformat(),
        meta_lines=[f"Valid until: {quotation.valid_until.isoformat()}"] if quotation.valid_until else [],
        line_items=[{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price, "line_total": i.line_total} for i in quotation.items],
        totals=[
            ("Subtotal", f"{quotation.subtotal:,.2f}"),
            ("Discount", f"-{quotation.discount_total:,.2f}"),
            ("Tax", f"{quotation.tax_total:,.2f}"),
            ("Total", f"{quotation.grand_total:,.2f}"),
        ],
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{quotation.number}.pdf"'
    })
