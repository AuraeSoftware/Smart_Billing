import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id
from app.models.billing import Invoice, InvoiceItem, InvoiceStatus
from app.models.branding import TenantBranding
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.billing import InvoiceCreate, InvoiceOut
from app.services.numbering import next_document_number
from app.services.pdf import render_document_pdf

router = APIRouter()

# Status changes a user may make by hand. PAID / PARTIALLY_PAID are set only
# by recording a receipt (see receipts.py); OVERDUE is meant to be set by a
# scheduled job comparing due_date to today (not part of this scaffold —
# see README "known gaps").
_MANUAL_TRANSITIONS: dict[InvoiceStatus, set[InvoiceStatus]] = {
    InvoiceStatus.DRAFT: {InvoiceStatus.SENT, InvoiceStatus.CANCELLED},
    InvoiceStatus.SENT: {InvoiceStatus.VIEWED, InvoiceStatus.CANCELLED},
    InvoiceStatus.VIEWED: {InvoiceStatus.CANCELLED},
}


class StatusUpdate(BaseModel):
    status: InvoiceStatus


def _compute_totals(items: list[InvoiceItem]) -> tuple[float, float, float, float]:
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


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    number = next_document_number(db, tenant_id=uuid.UUID(tenant_id), doc_type="invoice", on=payload.issue_date)
    invoice = Invoice(
        tenant_id=tenant_id, number=number, customer_name=payload.customer_name,
        customer_email=payload.customer_email, customer_address=payload.customer_address,
        issue_date=payload.issue_date, due_date=payload.due_date, notes=payload.notes,
        created_by=user.id,
    )
    invoice.items = [InvoiceItem(**item.model_dump()) for item in payload.items]
    invoice.subtotal, invoice.tax_total, invoice.discount_total, invoice.grand_total = _compute_totals(invoice.items)
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Full history — this is what the frontend's offline cache mirrors into
    IndexedDB on each successful sync (SOW 3.5)."""
    return db.query(Invoice).filter(Invoice.tenant_id == tenant_id).order_by(Invoice.created_at.desc()).all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    return invoice


@router.patch("/{invoice_id}/status", response_model=InvoiceOut)
def update_invoice_status(
    invoice_id: uuid.UUID,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")

    allowed = _MANUAL_TRANSITIONS.get(invoice.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot move an invoice from '{invoice.status.value}' to '{payload.status.value}'.",
        )
    invoice.status = payload.status
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one()
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()

    pdf_bytes = render_document_pdf(
        doc_type="INVOICE", number=invoice.number, tenant_name=tenant.name, branding=branding,
        customer_name=invoice.customer_name, issue_date=invoice.issue_date.isoformat(),
        meta_lines=[f"Due: {invoice.due_date.isoformat()}"] if invoice.due_date else [],
        line_items=[{"description": i.description, "quantity": i.quantity, "unit_price": i.unit_price, "line_total": i.line_total} for i in invoice.items],
        totals=[
            ("Subtotal", f"{invoice.subtotal:,.2f}"),
            ("Discount", f"-{invoice.discount_total:,.2f}"),
            ("Tax", f"{invoice.tax_total:,.2f}"),
            ("Total", f"{invoice.grand_total:,.2f}"),
        ],
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{invoice.number}.pdf"'
    })
