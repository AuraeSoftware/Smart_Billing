"""
Admin dashboards from the proposal's Deliverables table: "Platform analytics
for Aurae; tenant analytics for each client."
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_supreme_admin, require_tenant_staff, current_tenant_id
from app.models.tenant import Tenant, SubscriptionStatus
from app.models.billing import Invoice, Quotation, Receipt, InvoiceStatus
from app.models.user import User

router = APIRouter()


class PlatformAnalyticsOut(BaseModel):
    total_tenants: int
    active_tenants: int
    pending_onboarding_tenants: int
    suspended_tenants: int
    total_invoices: int
    total_quotations: int
    total_receipts: int
    platform_revenue_collected: float


@router.get("/platform", response_model=PlatformAnalyticsOut)
def platform_analytics(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    """Supreme Admin's platform-wide view across every tenant."""
    tenants = db.query(Tenant).all()
    revenue = db.query(func.coalesce(func.sum(Receipt.amount), 0)).scalar() or 0
    return PlatformAnalyticsOut(
        total_tenants=len(tenants),
        active_tenants=sum(1 for t in tenants if t.subscription_status == SubscriptionStatus.ACTIVE),
        pending_onboarding_tenants=sum(1 for t in tenants if t.subscription_status == SubscriptionStatus.PENDING_ONBOARDING),
        suspended_tenants=sum(1 for t in tenants if t.subscription_status == SubscriptionStatus.SUSPENDED),
        total_invoices=db.query(func.count(Invoice.id)).scalar() or 0,
        total_quotations=db.query(func.count(Quotation.id)).scalar() or 0,
        total_receipts=db.query(func.count(Receipt.id)).scalar() or 0,
        platform_revenue_collected=float(revenue),
    )


class TenantAnalyticsOut(BaseModel):
    invoice_count: int
    quotation_count: int
    receipt_count: int
    outstanding_receivables: float
    revenue_collected: float
    overdue_invoice_count: int
    last_30_days_revenue: float


@router.get("/tenant", response_model=TenantAnalyticsOut)
def tenant_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Super Admin / tenant-staff view scoped to their own tenant."""
    invoices = db.query(Invoice).filter(Invoice.tenant_id == tenant_id).all()
    outstanding = sum(float(i.grand_total) - float(i.amount_paid) for i in invoices if i.status not in (InvoiceStatus.CANCELLED,))
    revenue = db.query(func.coalesce(func.sum(Receipt.amount), 0)).filter(Receipt.tenant_id == tenant_id).scalar() or 0

    today = date.today()
    overdue = sum(
        1 for i in invoices
        if i.due_date and i.due_date < today and i.status not in (InvoiceStatus.PAID, InvoiceStatus.CANCELLED)
    )

    thirty_days_ago = today - timedelta(days=30)
    recent_revenue = (
        db.query(func.coalesce(func.sum(Receipt.amount), 0))
        .filter(Receipt.tenant_id == tenant_id, Receipt.received_at >= thirty_days_ago)
        .scalar() or 0
    )

    return TenantAnalyticsOut(
        invoice_count=len(invoices),
        quotation_count=db.query(func.count(Quotation.id)).filter(Quotation.tenant_id == tenant_id).scalar() or 0,
        receipt_count=db.query(func.count(Receipt.id)).filter(Receipt.tenant_id == tenant_id).scalar() or 0,
        outstanding_receivables=round(outstanding, 2),
        revenue_collected=float(revenue),
        overdue_invoice_count=overdue,
        last_30_days_revenue=float(recent_revenue),
    )
