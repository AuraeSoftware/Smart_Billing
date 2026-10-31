import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id, require_active_tenant
from app.models.billing import Invoice, InvoiceItem, InvoiceStatus
from app.models.branding import TenantBranding
from app.models.tenant import Tenant
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.schemas.billing import InvoiceCreate, InvoiceOut, InvoicePaymentIn, InvoicePaymentOut
from app.services.numbering import next_document_number
from app.services.pdf import render_document_pdf, business_lines, pretty_date
from app.services.usage import invoices_this_month
from app.api.v1.endpoints.customers import find_or_create_customer, remember_customer_details
from app.api.v1.endpoints.receipts import record_receipt

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


def _contact_lines(address, phone, email) -> list[str]:
    lines: list[str] = []
    if address:
        lines += [ln.strip() for ln in str(address).splitlines() if ln.strip()][:4]
    if phone:
        lines.append(f"Phone: {phone}")
    if email:
        lines.append(f"Email: {email}")
    return lines


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
    tenant_id: str = Depends(require_active_tenant),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one()
    if tenant.subscription_plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
        if plan and plan.max_invoices_per_month is not None and invoices_this_month(db, tenant_id) >= plan.max_invoices_per_month:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Monthly invoice limit reached ({plan.max_invoices_per_month}/{plan.max_invoices_per_month} on "
                f"the {plan.name} plan). It resets at the start of next month, or contact Aurae Software "
                "Solutions to upgrade your plan.",
            )

    number = next_document_number(db, tenant_id=uuid.UUID(tenant_id), doc_type="invoice", on=payload.issue_date)
    # SB04: customer_name/email stay exactly as entered (unchanged
    # requirement, unchanged PDF behavior) — this just also links a real
    # Customer record: an explicit customer_id from the picker's "select
    # existing" path is trusted as-is, otherwise one is found-or-created by
    # name so repeat customers don't duplicate.
    if payload.customer_id:
        customer_id_value = payload.customer_id
    else:
        customer_id_value = find_or_create_customer(db, tenant_id, payload.customer_name, payload.customer_email).id
    invoice = Invoice(
        tenant_id=tenant_id, number=number, customer_name=payload.customer_name,
        customer_email=payload.customer_email, customer_address=payload.customer_address,
        customer_phone=payload.customer_phone,
        customer_id=customer_id_value,
        issue_date=payload.issue_date, due_date=payload.due_date, notes=payload.notes,
        created_by=user.id,
    )
    invoice.items = [InvoiceItem(**item.model_dump()) for item in payload.items]
    invoice.subtotal, invoice.tax_total, invoice.discount_total, invoice.grand_total = _compute_totals(invoice.items)
    remember_customer_details(db, customer_id_value, payload.customer_email, payload.customer_phone, payload.customer_address)
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


@router.put("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: uuid.UUID,
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(require_active_tenant),
):
    """Edit an invoice's details and line items. The number, status and
    payments recorded so far are untouched; totals are recomputed. Paid and
    cancelled invoices are locked."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    if invoice.status in (InvoiceStatus.PAID, InvoiceStatus.CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {invoice.status.value} invoice can't be edited.")
    if not payload.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An invoice needs at least one line item.")

    if payload.customer_id:
        invoice.customer_id = payload.customer_id
    elif payload.customer_name.strip().lower() != (invoice.customer_name or "").strip().lower():
        invoice.customer_id = find_or_create_customer(db, tenant_id, payload.customer_name, payload.customer_email).id
    invoice.customer_name = payload.customer_name
    invoice.customer_email = payload.customer_email
    invoice.customer_address = payload.customer_address
    invoice.customer_phone = payload.customer_phone
    if invoice.customer_id:
        remember_customer_details(db, invoice.customer_id, payload.customer_email, payload.customer_phone, payload.customer_address)
    invoice.issue_date = payload.issue_date
    invoice.due_date = payload.due_date
    invoice.notes = payload.notes
    invoice.items = [InvoiceItem(**item.model_dump()) for item in payload.items]
    subtotal, tax, discount, grand = _compute_totals(invoice.items)
    if grand < float(invoice.amount_paid):
        db.rollback()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"The new total ({grand:,.2f}) can't be lower than the {float(invoice.amount_paid):,.2f} already received.",
        )
    invoice.subtotal, invoice.tax_total, invoice.discount_total, invoice.grand_total = subtotal, tax, discount, grand
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/{invoice_id}/payment", response_model=InvoicePaymentOut, status_code=status.HTTP_201_CREATED)
def pay_invoice(
    invoice_id: uuid.UUID,
    payload: InvoicePaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(require_active_tenant),
):
    """Mark an invoice fully or partially paid. A receipt for the amount is
    generated automatically and the invoice status follows."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    if invoice.status in (InvoiceStatus.PAID, InvoiceStatus.CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A {invoice.status.value} invoice can't take a payment.")
    remaining = round(float(invoice.grand_total) - float(invoice.amount_paid), 2)
    if remaining <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This invoice has no balance outstanding.")

    if payload.mode == "full":
        amount = remaining
    else:
        if payload.amount is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the amount received.")
        if payload.amount >= remaining:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"A partial payment must be less than the {remaining:,.2f} outstanding. Use 'Fully paid' to settle it.",
            )
        amount = round(payload.amount, 2)

    receipt = record_receipt(
        db, tenant_id=tenant_id, user=user, invoice=invoice, amount=amount,
        is_partial=payload.mode == "partial", payment_method=payload.payment_method,
        payment_reference=payload.payment_reference, notes=payload.notes,
        received_at=payload.received_at or date.today(),
    )
    db.commit()
    db.refresh(invoice)
    db.refresh(receipt)
    return {"invoice": invoice, "receipt": receipt}


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

    # SB03: every amount on the PDF now carries the tenant's own billing
    # currency (Tenant.currency) and a fixed 2-decimal format, instead of
    # bare numbers that silently dropped trailing zeros (e.g. "190.8").
    cur = tenant.currency
    pdf_bytes = render_document_pdf(
        doc_type="INVOICE", number=invoice.number, tenant_name=tenant.name, branding=branding,
        customer_name=invoice.customer_name, issue_date=invoice.issue_date.isoformat(),
        customer_lines=_contact_lines(invoice.customer_address, invoice.customer_phone, invoice.customer_email),
        from_lines=business_lines(tenant, branding),
        meta_fields=[("Invoice Due", pretty_date(invoice.due_date.isoformat()))] if invoice.due_date else [],
        note="Payment Received" if invoice.status == InvoiceStatus.PAID else invoice.notes,
        meta_lines=[],
        line_items=[
            {"description": i.description, "quantity": i.quantity, "unit_price": f"{cur} {float(i.unit_price):,.2f}", "line_total": f"{cur} {float(i.line_total):,.2f}"}
            for i in invoice.items
        ],
        totals=[
            ("Subtotal", f"{cur} {invoice.subtotal:,.2f}"),
            ("Discount", f"-{cur} {invoice.discount_total:,.2f}"),
            ("Tax", f"{cur} {invoice.tax_total:,.2f}"),
            ("Total", f"{cur} {invoice.grand_total:,.2f}"),
        ],
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{invoice.number}.pdf"'
    })
