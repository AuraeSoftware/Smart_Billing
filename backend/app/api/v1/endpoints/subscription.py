"""
Tenant subscription/onboarding — SOW 3.4. Two steps:
  1. POST /subscription/signup   — create the tenant + first Super Admin (status: pending_onboarding)
  2. POST /subscription/branding — upload logo/header/footer, which activates the tenant

A tenant cannot be used (no other endpoint accepts its data) until step 2 is done.
"""
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.security import hash_password
from app.api.deps import require_super_admin, current_tenant_id
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.branding import TenantBranding
from app.schemas.tenant import TenantSignupRequest, TenantOut, BrandingOut
from app.services.subscription import activate_tenant, OnboardingIncompleteError
from app.services.subscription_events import log_subscription_event

router = APIRouter()


@router.post("/signup", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
def signup(payload: TenantSignupRequest, db: Session = Depends(get_db)):
    if db.query(Tenant).filter(Tenant.slug == payload.slug).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That slug is already taken.")
    if db.query(User).filter(User.email == payload.super_admin_email).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered.")

    tenant = Tenant(name=payload.tenant_name, slug=payload.slug, contact_email=payload.contact_email)
    db.add(tenant)
    db.flush()

    super_admin = User(
        tenant_id=tenant.id, email=payload.super_admin_email,
        hashed_password=hash_password(payload.super_admin_password),
        full_name=payload.super_admin_full_name, role=UserRole.SUPER_ADMIN,
    )
    db.add(super_admin)
    db.add(TenantBranding(tenant_id=tenant.id))  # placeholder row, filled by /branding
    log_subscription_event(
        db, tenant=tenant, event_type="signed_up",
        new_value="pending_onboarding", note=f"Tenant signup by {payload.super_admin_full_name}",
    )
    db.commit()
    db.refresh(tenant)
    return tenant


def _save_upload(tenant_id: uuid.UUID, kind: str, file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1] or ".png"
    directory = os.path.join(settings.UPLOAD_DIR, str(tenant_id))
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f"{kind}{ext}")
    with open(path, "wb") as f:
        f.write(file.file.read())
    return path


@router.post("/{tenant_id}/branding", response_model=BrandingOut)
def submit_branding(
    tenant_id: uuid.UUID,
    logo: UploadFile = File(...),
    header: UploadFile = File(...),
    footer: UploadFile = File(...),
    footer_text: str = "",
    db: Session = Depends(get_db),
):
    """Mandatory branding step of onboarding (SOW 3.4). All three assets are
    required — the tenant is not activated otherwise. Validate type/size here
    before accepting production traffic; kept minimal in this scaffold."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")

    allowed_types = {"image/png", "image/jpeg", "image/webp"}
    for f in (logo, header, footer):
        if f.content_type not in allowed_types:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{f.filename}: only PNG/JPEG/WebP images are accepted.")

    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()
    if branding is None:
        branding = TenantBranding(tenant_id=tenant_id)

    branding.logo_url = _save_upload(tenant_id, "logo", logo)
    branding.header_url = _save_upload(tenant_id, "header", header)
    branding.footer_url = _save_upload(tenant_id, "footer", footer)
    branding.footer_text = footer_text
    db.add(branding)

    try:
        activate_tenant(db, tenant=tenant)
    except OnboardingIncompleteError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    log_subscription_event(
        db, tenant=tenant, event_type="activated",
        old_value="pending_onboarding", new_value="active",
        note="Branding assets uploaded; workspace activated.",
    )
    db.commit()
    db.refresh(branding)
    return branding


@router.get("/branding", response_model=BrandingOut)
def get_my_branding(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    """The Super Admin settings screen reads current branding from here."""
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()
    if branding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branding not set up yet.")
    return branding


@router.put("/branding", response_model=BrandingOut)
def update_my_branding(
    logo: UploadFile | None = File(None),
    header: UploadFile | None = File(None),
    footer: UploadFile | None = File(None),
    footer_text: str | None = Form(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    """
    Post-onboarding branding edits (proposal: "Branding assets remain editable
    afterward from the Super Admin settings panel"). Each asset is optional
    here — only what's provided gets replaced; unlike /subscription/{id}/branding,
    this never blocks on missing fields since the tenant is already active.
    """
    branding = db.query(TenantBranding).filter(TenantBranding.tenant_id == tenant_id).one_or_none()
    if branding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branding not set up yet — use the subscription flow first.")

    allowed_types = {"image/png", "image/jpeg", "image/webp"}
    tid = uuid.UUID(tenant_id)
    if logo is not None:
        if logo.content_type not in allowed_types:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Logo must be PNG/JPEG/WebP.")
        branding.logo_url = _save_upload(tid, "logo", logo)
    if header is not None:
        if header.content_type not in allowed_types:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Header must be PNG/JPEG/WebP.")
        branding.header_url = _save_upload(tid, "header", header)
    if footer is not None:
        if footer.content_type not in allowed_types:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Footer must be PNG/JPEG/WebP.")
        branding.footer_url = _save_upload(tid, "footer", footer)
    if footer_text is not None:
        branding.footer_text = footer_text

    db.add(branding)
    db.commit()
    db.refresh(branding)
    return branding
