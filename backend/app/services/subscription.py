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
    tenant.subscription_status = SubscriptionStatus.ACTIVE
    db.add(tenant)
    return tenant
