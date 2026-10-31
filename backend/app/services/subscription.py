"""
SOW Section 3.4 — Branding Capture at Subscription.

A tenant's subscription_status cannot become ACTIVE until logo/header/footer
are on file. This function is the single gate the onboarding endpoint calls —
keeping the rule here (not just a required-field check in the frontend) means
no code path can activate a tenant without branding, including future admin
tooling or scripts.
"""
from sqlalchemy.orm import Session

from app.models.tenant import Tenant, SubscriptionStatus
from app.models.branding import TenantBranding
from app.models.subscription_plan import SubscriptionPlan
from app.models.payment import SubscriptionPayment
from app.services.plan_expiry import start_plan_term


class OnboardingIncompleteError(Exception):
    pass


def activate_tenant(db: Session, *, tenant: Tenant) -> Tenant:
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant.id).one_or_none()
    if branding is None or not branding.logo_url:
        raise OnboardingIncompleteError(
            "Logo, header, and footer must be uploaded before the tenant workspace can be activated."
        )
    if tenant.subscription_plan_id is None:
        raise OnboardingIncompleteError(
            "A subscription plan must be selected before the tenant workspace can be activated."
        )
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
    # Paid plans must clear a successful subscription payment before the
    # workspace goes live — the same hard gate branding already is. Trial
    # plans skip this: they never go through the payment step at signup.
    if plan is not None and not plan.is_trial:
        paid = db.query(SubscriptionPayment).filter(
            SubscriptionPayment.tenant_id == tenant.id,
            SubscriptionPayment.status == "paid",
        ).one_or_none()
        if paid is None:
            raise OnboardingIncompleteError(
                "Payment must be completed before the workspace can be activated."
            )
    # Trial workspaces are not self-activating: once branding is in, they
    # wait in "pending_onboarding" for the Supreme Admin to approve them
    # (Super Admins > Pending Onboarding > Activate tenant). Paid plans are
    # unchanged: payment + branding activates them straight away.
    if plan is not None and plan.is_trial:
        return tenant
    tenant.subscription_status = SubscriptionStatus.ACTIVE
    if plan is not None:
        start_plan_term(tenant, plan)
    db.add(tenant)
    return tenant


def is_awaiting_approval(db: Session, tenant: Tenant) -> bool:
    """True for a trial workspace that has finished signup + branding but
    hasn't been approved by the Supreme Admin yet."""
    if tenant.subscription_status != SubscriptionStatus.PENDING_ONBOARDING or tenant.subscription_plan_id is None:
        return False
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
    if plan is None or not plan.is_trial:
        return False
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant.id).one_or_none()
    return branding is not None and bool(branding.logo_url)
