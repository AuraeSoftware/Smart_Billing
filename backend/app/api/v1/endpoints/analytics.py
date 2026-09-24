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
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.services.usage import usage_snapshot

router = APIRouter()


# ---------------------------------------------------------------------------
# Customers — Smart Garage 360's "Customers" sidebar page, adapted for
# billing: there's no separate Customer table (invoices/quotations carry
# their own customer_name/email), so this aggregates by customer name across
# both documents rather than querying a dedicated entity.
# ---------------------------------------------------------------------------

class CustomerRow(BaseModel):
    name: str
    email: str | None
    invoice_count: int
    quotation_count: int
    total_billed: float
    total_paid: float
    last_activity: str | None


@router.get("/tenant/customers", response_model=list[CustomerRow])
def tenant_customers(
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Aggregates every invoice/quotation for the tenant by customer name,
    for the Super Admin's Customers page — a running ledger of who's been
    billed, how much, and how much has actually come in, without a separate
    customer database to keep in sync."""
    invoices = db.query(Invoice).filter(Invoice.tenant_id == tenant_id).all()
    quotations = db.query(Quotation).filter(Quotation.tenant_id == tenant_id).all()

    rows: dict[str, dict] = {}

    def bucket(name: str, email: str | None) -> dict:
        key = name.strip().lower()
        if key not in rows:
            rows[key] = {
                "name": name, "email": email, "invoice_count": 0, "quotation_count": 0,
                "total_billed": 0.0, "total_paid": 0.0, "last_activity": None,
            }
        b = rows[key]
        if email and not b["email"]:
            b["email"] = email
        return b

    for inv in invoices:
        b = bucket(inv.customer_name, inv.customer_email)
        b["invoice_count"] += 1
        b["total_billed"] += float(inv.grand_total)
        b["total_paid"] += float(inv.amount_paid)
        stamp = inv.issue_date.isoformat()
        if not b["last_activity"] or stamp > b["last_activity"]:
            b["last_activity"] = stamp

    for q in quotations:
        b = bucket(q.customer_name, q.customer_email)
        b["quotation_count"] += 1
        stamp = q.issue_date.isoformat()
        if not b["last_activity"] or stamp > b["last_activity"]:
            b["last_activity"] = stamp

    return [
        CustomerRow(**b) for b in sorted(rows.values(), key=lambda r: r["name"].lower())
    ]


def _status_value(status) -> str:
    """SubscriptionStatus is a str-Enum bound by .value at the DB level, but a
    row loaded via the ORM gives back the Python enum member — normalize both
    shapes to the plain string the frontend expects."""
    return status.value if hasattr(status, "value") else str(status)


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


class TenantRevenueRow(BaseModel):
    tenant_id: str
    name: str
    slug: str
    contact_email: str
    subscription_status: str
    created_at: str
    # Plan-usage tracking rather than the tenant's own business figures —
    # Aurae tracks the Super Admin/plan relationship, not client revenue or
    # document counts (those are the tenant's own business data).
    plan_name: str | None
    invoices_used: int
    invoices_limit: int | None
    usage_percent: float
    days_until_reset: int
    warning_level: str


@router.get("/platform/tenants", response_model=list[TenantRevenueRow])
def platform_tenant_breakdown(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    """Per-tenant plan/usage breakdown for the Supreme Admin's Reports page —
    which Super Admin is on which plan, and how close they are to their
    monthly invoice limit. Deliberately excludes each tenant's own revenue
    and document counts, which are their business data, not Aurae's."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    rows: list[TenantRevenueRow] = []
    for t in tenants:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == t.subscription_plan_id).one_or_none() if t.subscription_plan_id else None
        usage = usage_snapshot(db, t.id, plan)
        rows.append(TenantRevenueRow(
            tenant_id=str(t.id),
            name=t.name,
            slug=t.slug,
            contact_email=t.contact_email,
            subscription_status=_status_value(t.subscription_status),
            created_at=t.created_at.isoformat(),
            plan_name=plan.name if plan else None,
            **usage,
        ))
    return rows


class RevenueTrendPoint(BaseModel):
    year: int
    month: int
    label: str
    revenue: float


@router.get("/platform/revenue-trend", response_model=list[RevenueTrendPoint])
def platform_revenue_trend(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    """Monthly platform revenue, across every tenant, for the Supreme Admin
    command center's revenue-trend chart and its Year/Month filter."""
    rows = db.query(Receipt.received_at, Receipt.amount).all()
    buckets: dict[tuple[int, int], float] = {}
    for received_at, amount in rows:
        key = (received_at.year, received_at.month)
        buckets[key] = buckets.get(key, 0.0) + float(amount)
    return [
        RevenueTrendPoint(year=y, month=m, label=date(y, m, 1).strftime("%b %Y"), revenue=round(v, 2))
        for (y, m), v in sorted(buckets.items())
    ]


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
