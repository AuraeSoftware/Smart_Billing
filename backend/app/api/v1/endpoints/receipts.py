import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id, require_active_tenant
from app.models.billing import Receipt, Invoice, InvoiceStatus
from app.models.branding import TenantBranding
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.billing import ReceiptCreate, ReceiptOut
from app.services.numbering import next_document_number
from app.services.pdf import render_document_pdf

router = APIRouter()


def record_receipt(db: Session, *, tenant_id: str, user: User, invoice: Invoice, amount: float,
                   is_partial: bool, payment_method, payment_reference, notes, received_at) -> Receipt:
    """Single place a payment is turned into a Receipt + updated invoice
    status. Used by POST /receipts (unchanged behavior) and by the invoice
    "fully paid / partially paid" actions so both produce identical records.
    Does not commit; the caller does."""
    number = next_document_number(db, tenant_id=uuid.UUID(str(tenant_id)), doc_type="receipt", on=received_at)
    receipt = Receipt(
        tenant_id=tenant_id, invoice_id=invoice.id, number=number, amount=amount,
        is_partial=is_partial, payment_method=payment_method,
        payment_reference=payment_reference, notes=notes,
        received_at=received_at,
        created_by=user.id,
    )
    invoice.amount_paid = float(invoice.amount_paid) + amount
    invoice.status = InvoiceStatus.PAID if invoice.amount_paid >= float(invoice.grand_total) else InvoiceStatus.PARTIALLY_PAID
    db.add(receipt)
    db.add(invoice)
    return receipt


@router.post("", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(require_active_tenant),
):
    invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")

    receipt = record_receipt(
        db, tenant_id=tenant_id, user=user, invoice=invoice, amount=payload.amount,
        is_partial=payload.is_partial, payment_method=payload.payment_method,
        payment_reference=payload.payment_reference, notes=payload.notes,
        received_at=payload.received_at,
    )
    db.commit()
    db.refresh(receipt)
    return receipt


@router.get("", response_model=list[ReceiptOut])
def list_receipts(
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    return db.query(Receipt).filter(Receipt.tenant_id == tenant_id).order_by(Receipt.created_at.desc()).all()


@router.get("/{receipt_id}/pdf")
def receipt_pdf(
    receipt_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id, Receipt.tenant_id == tenant_id).one_or_none()
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt not found.")
    invoice = db.query(Invoice).filter(Invoice.id == receipt.invoice_id).one()
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one()
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()

    # SB03: tenant-currency prefix + fixed 2-decimal formatting, same as
    # invoices/quotations.
    cur = tenant.currency
    # SB02: the receipt PDF only ever showed the amount just received, with
    # no way to see the invoice's total, how much has been paid in all, or
    # what's still outstanding — added here without touching the existing
    # "Amount received" line or the full/partial wording above it.
    remaining = max(float(invoice.grand_total) - float(invoice.amount_paid), 0)
    pdf_bytes = render_document_pdf(
        doc_type="RECEIPT", number=receipt.number, tenant_name=tenant.name, branding=branding,
        customer_name=invoice.customer_name, issue_date=receipt.received_at.isoformat(),
        meta_lines=[
            f"Against invoice: {invoice.number}",
            f"Payment method: {receipt.payment_method or '—'}",
            *([f"Reference: {receipt.payment_reference}"] if receipt.payment_reference else []),
            *([f"Purpose: {receipt.notes}"] if receipt.notes else []),
        ],
        line_items=[{"description": f"Payment received ({'partial' if receipt.is_partial else 'full'})", "quantity": 1, "unit_price": f"{cur} {float(receipt.amount):,.2f}", "line_total": f"{cur} {float(receipt.amount):,.2f}"}],
        totals=[
            ("Invoice total", f"{cur} {float(invoice.grand_total):,.2f}"),
            ("Total paid to date", f"{cur} {float(invoice.amount_paid):,.2f}"),
            ("Balance remaining", f"{cur} {remaining:,.2f}"),
            ("Amount received", f"{cur} {float(receipt.amount):,.2f}"),
        ],
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{receipt.number}.pdf"'
    })
