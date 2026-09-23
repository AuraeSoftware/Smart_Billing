from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class TenantSignupRequest(BaseModel):
    """Step 1 of subscription onboarding: business + first Super Admin account.
    Branding (step 2) is submitted separately via /subscription/branding, and
    the tenant is not activated until that step completes (SOW 3.4)."""
    tenant_name: str
    slug: str
    contact_email: EmailStr
    super_admin_full_name: str
    super_admin_email: EmailStr
    super_admin_password: str


class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str
    contact_email: str
    subscription_status: str
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
