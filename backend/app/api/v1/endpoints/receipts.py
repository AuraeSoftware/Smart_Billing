import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_tenant_staff, current_tenant_id
from app.models.billing import Receipt, Invoice, InvoiceStatus
from app.models.branding import TenantBranding
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.billing import ReceiptCreate, ReceiptOut
from app.services.numbering import next_document_number
from app.services.pdf import render_document_pdf

router = APIRouter()


@router.post("", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    invoice = db.query(Invoice).filter(Invoice.id == payload.invoice_id, Invoice.tenant_id == tenant_id).one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")

    number = next_document_number(db, tenant_id=uuid.UUID(tenant_id), doc_type="receipt", on=payload.received_at)
    receipt = Receipt(
        tenant_id=tenant_id, invoice_id=invoice.id, number=number, amount=payload.amount,
        is_partial=payload.is_partial, payment_method=payload.payment_method,
        payment_reference=payload.payment_reference, received_at=payload.received_at,
        created_by=user.id,
    )
    invoice.amount_paid = float(invoice.amount_paid) + payload.amount
    invoice.status = InvoiceStatus.PAID if invoice.amount_paid >= float(invoice.grand_total) else InvoiceStatus.PARTIALLY_PAID

    db.add(receipt)
    db.add(invoice)
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

    pdf_bytes = render_document_pdf(
        doc_type="RECEIPT", number=receipt.number, tenant_name=tenant.name, branding=branding,
        customer_name=invoice.customer_name, issue_date=receipt.received_at.isoformat(),
        meta_lines=[f"Against invoice: {invoice.number}", f"Payment method: {receipt.payment_method or '—'}"],
        line_items=[{"description": f"Payment received ({'partial' if receipt.is_partial else 'full'})", "quantity": 1, "unit_price": f"{receipt.amount:,.2f}", "line_total": f"{receipt.amount:,.2f}"}],
        totals=[("Amount received", f"{receipt.amount:,.2f}")],
    )
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{receipt.number}.pdf"'
    })
