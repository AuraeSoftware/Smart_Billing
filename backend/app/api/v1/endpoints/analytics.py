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
# SB06 — Reports date-range + export. The existing /tenant endpoint below
# (used by the Overview page) is untouched; this is a separate, additive
# endpoint purely for the Reports tab, so nothing already depending on
# /analytics/tenant's all-time figures changes shape or meaning.
# ---------------------------------------------------------------------------

class ReportRow(BaseModel):
    date: str
    doc_type: str  # "invoice" | "quotation" | "receipt"
    number: str
    customer_name: str
    status: str
    amount: float


class TenantReportOut(BaseModel):
    from_date: str | None
    to_date: str | None
    invoice_count: int
    quotation_count: int
    receipt_count: int
    revenue_collected: float
    outstanding_receivables: float
    rows: list[ReportRow]


@router.get("/tenant/report", response_model=TenantReportOut)
def tenant_report(
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Date-filtered activity for the Super Admin's Reports tab — the same
    figures as /analytics/tenant, scoped to a From/To range, plus a
    transaction-level table the "Export (CSV)" button downloads as-is."""
    inv_q = db.query(Invoice).filter(Invoice.tenant_id == tenant_id)
    quo_q = db.query(Quotation).filter(Quotation.tenant_id == tenant_id)
    rec_q = db.query(Receipt).filter(Receipt.tenant_id == tenant_id)
    if from_date:
        inv_q = inv_q.filter(Invoice.issue_date >= from_date)
        quo_q = quo_q.filter(Quotation.issue_date >= from_date)
        rec_q = rec_q.filter(Receipt.received_at >= from_date)
    if to_date:
        inv_q = inv_q.filter(Invoice.issue_date <= to_date)
        quo_q = quo_q.filter(Quotation.issue_date <= to_date)
        rec_q = rec_q.filter(Receipt.received_at <= to_date)

    invoices = inv_q.all()
    quotations = quo_q.all()
    receipts = rec_q.all()

    # A draft hasn't been sent to the customer yet, so it isn't money owed
    # to the business — same reasoning as Invoice.is_overdue excluding
    # drafts. Matches the fix applied to /tenant's outstanding_receivables.
    outstanding = sum(
        float(i.grand_total) - float(i.amount_paid)
        for i in invoices
        if i.status not in (InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED)
    )
    revenue = sum(float(r.amount) for r in receipts)

    rows = [
        ReportRow(date=i.issue_date.isoformat(), doc_type="invoice", number=i.number, customer_name=i.customer_name, status=i.status.value, amount=float(i.grand_total))
        for i in invoices
    ] + [
        ReportRow(date=q.issue_date.isoformat(), doc_type="quotation", number=q.number, customer_name=q.customer_name, status=q.status.value, amount=float(q.grand_total))
        for q in quotations
    ] + [
        ReportRow(date=r.received_at.isoformat(), doc_type="receipt", number=r.number, customer_name=(db.query(Invoice).filter(Invoice.id == r.invoice_id).one()).customer_name, status="received", amount=float(r.amount))
        for r in receipts
    ]
    rows.sort(key=lambda r: r.date, reverse=True)

    return TenantReportOut(
        from_date=from_date.isoformat() if from_date else None,
        to_date=to_date.isoformat() if to_date else None,
        invoice_count=len(invoices),
        quotation_count=len(quotations),
        receipt_count=len(receipts),
        revenue_collected=round(revenue, 2),
        outstanding_receivables=round(outstanding, 2),
        rows=rows,
    )


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
    # Kept for the Overview command center's revenue leaderboard/chart,
    # which existed before the plan-usage feature and still needs it.
    invoice_count: int
    quotation_count: int
    receipt_count: int
    revenue_collected: float
    # Plan-usage tracking — added for the Reports and Super Admins pages,
    # which show this instead of the fields above (Aurae tracks the plan
    # relationship there, not the tenant's own business figures).
    plan_name: str | None
    invoices_used: int
    invoices_limit: int | None
    usage_percent: float
    days_until_reset: int
    warning_level: str


@router.get("/platform/tenants", response_model=list[TenantRevenueRow])
def platform_tenant_breakdown(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    """Per-tenant revenue + document counts (Overview's leaderboard) plus
    plan/usage tracking (Reports and Super Admins pages) in one row, since
    both views are built from the same per-tenant sweep."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    rows: list[TenantRevenueRow] = []
    for t in tenants:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == t.subscription_plan_id).one_or_none() if t.subscription_plan_id else None
        usage = usage_snapshot(db, t.id, plan)
        revenue = (
            db.query(func.coalesce(func.sum(Receipt.amount), 0))
            .filter(Receipt.tenant_id == t.id)
            .scalar() or 0
        )
        rows.append(TenantRevenueRow(
            tenant_id=str(t.id),
            name=t.name,
            slug=t.slug,
            contact_email=t.contact_email,
            subscription_status=_status_value(t.subscription_status),
            created_at=t.created_at.isoformat(),
            invoice_count=db.query(func.count(Invoice.id)).filter(Invoice.tenant_id == t.id).scalar() or 0,
            quotation_count=db.query(func.count(Quotation.id)).filter(Quotation.tenant_id == t.id).scalar() or 0,
            receipt_count=db.query(func.count(Receipt.id)).filter(Receipt.tenant_id == t.id).scalar() or 0,
            revenue_collected=float(revenue),
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
    # The rupee amount behind overdue_invoice_count — a subset of
    # outstanding_receivables, not a separate pool. Added so the Overview
    # banner can state both figures plainly instead of leaving the reader to
    # infer whether "past due" and "outstanding" are the same number.
    overdue_amount: float
    last_30_days_revenue: float


@router.get("/tenant", response_model=TenantAnalyticsOut)
def tenant_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id),
):
    """Super Admin / tenant-staff view scoped to their own tenant."""
    invoices = db.query(Invoice).filter(Invoice.tenant_id == tenant_id).all()
    # A draft hasn't been sent to the customer, so it isn't a receivable yet
    # — same reasoning behind Invoice.is_overdue excluding drafts.
    outstanding = sum(
        float(i.grand_total) - float(i.amount_paid)
        for i in invoices
        if i.status not in (InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED)
    )
    revenue = db.query(func.coalesce(func.sum(Receipt.amount), 0)).filter(Receipt.tenant_id == tenant_id).scalar() or 0

    today = date.today()
    # Invoice.is_overdue is the single source of truth (also used by
    # InvoiceOut, so the Invoices table and this count never disagree). A
    # DRAFT invoice hasn't been sent to anyone yet, so its due date doesn't
    # start counting against it until it's actually dispatched.
    overdue = sum(1 for i in invoices if i.is_overdue)
    overdue_amount = sum(float(i.grand_total) - float(i.amount_paid) for i in invoices if i.is_overdue)

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
        overdue_amount=round(overdue_amount, 2),
        last_30_days_revenue=float(recent_revenue),
    )
