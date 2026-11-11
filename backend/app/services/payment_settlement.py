"""
Applies a successfully paid Razorpay order to the workspace.

Used by the browser "verify" calls and by the Razorpay webhook, so a payment
is settled exactly once whichever of them reaches the server first (the
webhook covers a customer who pays and then closes the tab).
"""
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.payment import SubscriptionPayment
from app.models.subscription_plan import SubscriptionPlan
from app.models.tenant import Tenant
from app.models.upgrade_request import PlanUpgradeRequest
from app.services.plan_expiry import renew_plan_term
from app.services.subscription_events import log_subscription_event


def mark_paid(db: Session, payment: SubscriptionPayment, *, payment_id: str, signature: str | None) -> bool:
    """Flags the row paid. Returns False if it already was (nothing to do)."""
    if payment.status == "paid":
        return False
    payment.status = "paid"
    payment.gateway_payment_id = payment_id
    payment.gateway_signature = signature
    payment.paid_at = datetime.now(timezone.utc)
    db.add(payment)
    return True


def apply_upgrade_payment(db: Session, payment: SubscriptionPayment, *, user_id=None) -> None:
    """Paid upgrade / renewal: same effect as the Supreme Admin approving the
    request — new plan, a fresh term stacked after any paid time left — and the
    request history records it as approved (paid online)."""
    tenant = db.query(Tenant).filter(Tenant.id == payment.tenant_id).one()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payment.subscription_plan_id).one()
    old_plan = (
        db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
        if tenant.subscription_plan_id else None
    )
    now = datetime.now(timezone.utc)
    pending = db.query(PlanUpgradeRequest).filter(
        PlanUpgradeRequest.tenant_id == tenant.id, PlanUpgradeRequest.status == "pending",
    ).all()
    for r in pending:
        r.status = "approved"
        r.decision_note = "Paid online via Razorpay."
        r.decided_at = now
        db.add(r)
    if not pending or all(r.to_plan_id != plan.id for r in pending):
        db.add(PlanUpgradeRequest(
            tenant_id=tenant.id, from_plan_id=tenant.subscription_plan_id, to_plan_id=plan.id,
            status="approved", note="Paid online", decision_note="Paid online via Razorpay.",
            requested_by_id=user_id, decided_at=now,
        ))
    tenant.subscription_plan_id = plan.id
    renew_plan_term(tenant, plan)
    db.add(tenant)
    log_subscription_event(
        db, tenant=tenant, event_type="payment_completed",
        new_value=f"{payment.currency} {payment.amount}", note="Plan upgrade paid online via Razorpay",
    )
    log_subscription_event(
        db, tenant=tenant, event_type="plan_changed",
        old_value=old_plan.name if old_plan else None, new_value=plan.name,
        note=f"Upgrade paid online. Valid until {tenant.plan_expires_at.isoformat()}.",
    )
