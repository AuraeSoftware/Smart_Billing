"""Plan validity: when a workspace's plan ends and what that means.

plan_expires_at is the last valid day (inclusive). NULL means "no expiry"
(workspaces that predate expiry tracking). Only ACTIVE workspaces can be
"expired"; suspended/cancelled/pending ones are already blocked elsewhere."""
from datetime import date, timedelta

from app.models.tenant import Tenant, SubscriptionStatus
from app.models.subscription_plan import SubscriptionPlan


def plan_duration_days(plan: SubscriptionPlan) -> int:
    if plan.is_trial:
        return max(int(plan.trial_days or 0), 1)
    return 365 if (plan.billing_cycle or "").lower() == "yearly" else 30


def is_expired(tenant: Tenant, today: date | None = None) -> bool:
    if tenant.plan_expires_at is None or tenant.subscription_status != SubscriptionStatus.ACTIVE:
        return False
    return tenant.plan_expires_at < (today or date.today())


def days_left(tenant: Tenant, today: date | None = None) -> int | None:
    if tenant.plan_expires_at is None:
        return None
    return (tenant.plan_expires_at - (today or date.today())).days


def start_plan_term(tenant: Tenant, plan: SubscriptionPlan, today: date | None = None) -> None:
    """Begin a fresh term for `plan` starting today."""
    tenant.plan_expires_at = (today or date.today()) + timedelta(days=plan_duration_days(plan))


def renew_plan_term(tenant: Tenant, plan: SubscriptionPlan, today: date | None = None) -> None:
    """Approved upgrade/renewal: the new term starts today, or at the end of
    the current paid term if that is still running (so nobody loses days)."""
    today = today or date.today()
    base = today
    if tenant.plan_expires_at is not None and tenant.plan_expires_at > today and not plan.is_trial:
        base = tenant.plan_expires_at
    tenant.plan_expires_at = base + timedelta(days=plan_duration_days(plan))
