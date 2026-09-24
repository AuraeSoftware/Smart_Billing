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
    tenant.subscription_status = SubscriptionStatus.ACTIVE
    db.add(tenant)
    return tenant
