"""
Invoice-quota tracking against a tenant's subscription plan — the "Super
Admin picks a plan (e.g. Starter: 100 invoices/month) and gets warned, then
blocked, as they approach it" workflow. This is the single place that
counts a tenant's usage for the current calendar month and decides the
warning level, so the enforcement check in invoices.py, the Super Admin's
own usage banner (account.py), and the Supreme Admin's read-only view of it
(admin.py / analytics.py) can never disagree with each other.
"""
import calendar
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.billing import Invoice
from app.models.subscription_plan import SubscriptionPlan

# Warning thresholds, as a percentage of the plan's monthly invoice limit.
WARNING_THRESHOLD = 80
CRITICAL_THRESHOLD = 95


def invoices_this_month(db: Session, tenant_id) -> int:
    today = date.today()
    start = date(today.year, today.month, 1)
    return (
        db.query(Invoice)
        .filter(Invoice.tenant_id == tenant_id, Invoice.issue_date >= start)
        .count()
    )


def days_until_month_reset() -> int:
    today = date.today()
    last_day = calendar.monthrange(today.year, today.month)[1]
    return last_day - today.day


def usage_snapshot(db: Session, tenant_id: uuid.UUID | str, plan: SubscriptionPlan | None) -> dict:
    """Returns the shared shape used by every caller: how many invoices this
    tenant has created so far this month, the plan's monthly limit (None for
    a tenant with no plan), the percentage used, days left until the count
    resets, and a warning_level of none/warning/critical/limit_reached."""
    used = invoices_this_month(db, tenant_id)
    limit = plan.max_invoices_per_month if plan else None
    percent = round(used / limit * 100, 1) if limit else 0.0

    if limit is None:
        level = "none"
    elif used >= limit:
        level = "limit_reached"
    elif percent >= CRITICAL_THRESHOLD:
        level = "critical"
    elif percent >= WARNING_THRESHOLD:
        level = "warning"
    else:
        level = "none"

    return {
        "invoices_used": used,
        "invoices_limit": limit,
        "usage_percent": percent,
        "days_until_reset": days_until_month_reset(),
        "warning_level": level,
    }
