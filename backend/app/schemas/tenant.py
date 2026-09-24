from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class TenantSignupRequest(BaseModel):
    """Step 1 of subscription onboarding: business + first Super Admin account
    + the subscription plan they're signing up for. Branding (step 2) is
    submitted separately via /subscription/{id}/branding, and the tenant is
    not activated until both that step and a plan are on file (SOW 3.4)."""
    tenant_name: str
    slug: str
    contact_email: EmailStr
    super_admin_full_name: str
    super_admin_email: EmailStr
    super_admin_password: str
    subscription_plan_id: UUID


class PublicPlanOut(BaseModel):
    """What an unauthenticated visitor sees on the signup plan picker — no
    tenant_count or other platform-internal detail, just what they're buying."""
    id: UUID
    name: str
    description: Optional[str]
    currency: str
    price: float
    billing_cycle: str
    max_users: int
    max_invoices_per_month: int
    color: str
    has_priority_support: bool
    has_api_access: bool
    has_advanced_reports: bool
    has_multi_currency: bool

    class Config:
        from_attributes = True


class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str
    contact_email: str
    subscription_status: str
    currency: str = "INR"
    created_at: datetime

    class Config:
        from_attributes = True


class BrandingOut(BaseModel):
    logo_url: Optional[str]
    header_url: Optional[str]
    footer_url: Optional[str]
    footer_text: Optional[str]

    class Config:
        from_attributes = True
