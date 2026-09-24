"""
Tenant subscription/onboarding — SOW 3.4. Two steps:
  1. POST /subscription/signup   — create the tenant + first Super Admin (status: pending_onboarding)
  2. POST /subscription/branding — upload logo/header/footer, which activates the tenant

A tenant cannot be used (no other endpoint accepts its data) until step 2 is done.
"""
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings
from app.core.security import hash_password
from app.api.deps import require_super_admin, current_tenant_id
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.branding import TenantBranding
from app.models.subscription_plan import SubscriptionPlan
from app.models.payment import SubscriptionPayment
from app.models.payment_settings import PlatformPaymentSettings
from app.schemas.tenant import TenantSignupRequest, TenantOut, BrandingOut, PublicPlanOut
from app.services.subscription import activate_tenant, OnboardingIncompleteError
from app.services.subscription_events import log_subscription_event
from app.services.trial import assert_trial_available, claim_trial, TrialAlreadyUsedError
from app.services.razorpay_client import create_order, verify_signature, RazorpayError

router = APIRouter()


@router.get("/plans", response_model=list[PublicPlanOut])
def list_public_plans(db: Session = Depends(get_db)):
    """Unauthenticated — the signup page's plan picker reads from here."""
    return (
        db.query(SubscriptionPlan)
        .filter(SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.price)
        .all()
    )


@router.post("/signup", response_model=TenantOut, status_code=status.HTTP_201_CREATED)
def signup(payload: TenantSignupRequest, db: Session = Depends(get_db)):
    if db.query(Tenant).filter(Tenant.slug == payload.slug).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That slug is already taken.")
    if db.query(User).filter(User.email == payload.super_admin_email).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered.")
    plan = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.id == payload.subscription_plan_id, SubscriptionPlan.is_active.is_(True),
    ).one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please select a valid subscription plan.")

    # Trial plans are capped to one claim per company — checked before the
    # tenant is created so a rejected signup never leaves a half-created
    # tenant behind. See app/services/trial.py for what "one company" means
    # in the absence of real business-registration verification.
    trial_company_key = None
    if plan.is_trial:
        try:
            trial_company_key = assert_trial_available(
                db, business_name=payload.tenant_name, contact_email=payload.contact_email,
            )
        except TrialAlreadyUsedError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    tenant = Tenant(
        name=payload.tenant_name, slug=payload.slug, contact_email=payload.contact_email,
        currency=plan.currency, subscription_plan_id=plan.id,
    )
    db.add(tenant)
    db.flush()

    super_admin = User(
        tenant_id=tenant.id, email=payload.super_admin_email,
        hashed_password=hash_password(payload.super_admin_password),
        full_name=payload.super_admin_full_name, role=UserRole.SUPER_ADMIN,
    )
    db.add(super_admin)
    db.add(TenantBranding(tenant_id=tenant.id))  # placeholder row, filled by /branding
    if trial_company_key is not None:
        claim_trial(
            db, company_key=trial_company_key, tenant_id=tenant.id,
            business_name=payload.tenant_name, contact_email=payload.contact_email,
        )
    log_subscription_event(
        db, tenant=tenant, event_type="signed_up",
        new_value="pending_onboarding", note=f"Tenant signup by {payload.super_admin_full_name}",
    )
    log_subscription_event(
        db, tenant=tenant, event_type="plan_changed",
        old_value="none", new_value=plan.name, note="Selected at signup",
    )
    db.commit()
    db.refresh(tenant)
    return tenant


# ---------------------------------------------------------------------------
# Subscription payment — a paid plan must clear this before the workspace can
# be activated (see activate_tenant()). The signup page routes straight here
# for a paid plan, and straight to branding for a trial plan.
# ---------------------------------------------------------------------------

class PaymentOrderOut(BaseModel):
    order_id: str
    amount: int  # minor currency units (paise for INR), what Razorpay Checkout expects
    currency: str
    key_id: str
    plan_name: str


class PaymentVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentStatusOut(BaseModel):
    status: str  # not_required | pending | paid | failed


def _tenant_or_404(db: Session, tenant_id: uuid.UUID) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    return tenant


@router.post("/{tenant_id}/payment/create-order", response_model=PaymentOrderOut)
def create_payment_order(tenant_id: uuid.UUID, db: Session = Depends(get_db)):
    """Called from the payment step right after signup, before branding —
    unauthenticated like the rest of onboarding, since the Super Admin has
    no token yet at this point."""
    tenant = _tenant_or_404(db, tenant_id)
    if tenant.subscription_plan_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No plan selected for this workspace.")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The selected plan no longer exists.")
    if plan.is_trial:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The trial plan does not require payment.")

    already_paid = db.query(SubscriptionPayment).filter(
        SubscriptionPayment.tenant_id == tenant.id, SubscriptionPayment.status == "paid",
    ).one_or_none()
    if already_paid is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment has already been completed for this workspace.")

    gateway = db.query(PlatformPaymentSettings).first()
    if gateway is None or not gateway.razorpay_key_id or not gateway.razorpay_key_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Online payment isn't set up yet. Please contact Aurae Software Solutions LLP to complete your subscription.",
        )

    amount_minor = int(round(float(plan.price) * 100))
    try:
        order = create_order(
            key_id=gateway.razorpay_key_id, key_secret=gateway.razorpay_key_secret,
            amount_minor=amount_minor, currency=plan.currency, receipt=f"tenant-{tenant.id}",
        )
    except RazorpayError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    payment = SubscriptionPayment(
        tenant_id=tenant.id, subscription_plan_id=plan.id, amount=plan.price,
        currency=plan.currency, gateway="razorpay", gateway_order_id=order["id"], status="created",
    )
    db.add(payment)
    db.commit()

    return PaymentOrderOut(
        order_id=order["id"], amount=amount_minor, currency=plan.currency,
        key_id=gateway.razorpay_key_id, plan_name=plan.name,
    )


@router.post("/{tenant_id}/payment/verify", response_model=PaymentStatusOut)
def verify_payment_order(tenant_id: uuid.UUID, payload: PaymentVerifyIn, db: Session = Depends(get_db)):
    tenant = _tenant_or_404(db, tenant_id)
    payment = db.query(SubscriptionPayment).filter(
        SubscriptionPayment.tenant_id == tenant_id,
        SubscriptionPayment.gateway_order_id == payload.razorpay_order_id,
    ).one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No matching payment order found — start the payment again.")
    if payment.status == "paid":
        return PaymentStatusOut(status="paid")

    gateway = db.query(PlatformPaymentSettings).first()
    if gateway is None or not gateway.razorpay_key_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Online payment isn't set up yet.")

    ok = verify_signature(
        key_secret=gateway.razorpay_key_secret, order_id=payload.razorpay_order_id,
        payment_id=payload.razorpay_payment_id, signature=payload.razorpay_signature,
    )
    if not ok:
        payment.status = "failed"
        db.add(payment)
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment verification failed. Please try again.")

    payment.status = "paid"
    payment.gateway_payment_id = payload.razorpay_payment_id
    payment.gateway_signature = payload.razorpay_signature
    payment.paid_at = datetime.now(timezone.utc)
    db.add(payment)
    log_subscription_event(
        db, tenant=tenant, event_type="payment_completed",
        new_value=f"{payment.currency} {payment.amount}", note="Subscription payment verified via Razorpay",
    )
    db.commit()
    return PaymentStatusOut(status="paid")


@router.get("/{tenant_id}/payment/status", response_model=PaymentStatusOut)
def payment_status(tenant_id: uuid.UUID, db: Session = Depends(get_db)):
    """Lets the payment page resume correctly on refresh, and lets a trial
    tenant's flow (which never creates a payment row) report itself as not
    needing one."""
    tenant = _tenant_or_404(db, tenant_id)
    plan = (
        db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
        if tenant.subscription_plan_id else None
    )
    if plan is not None and plan.is_trial:
        return PaymentStatusOut(status="not_required")
    paid = db.query(SubscriptionPayment).filter(
        SubscriptionPayment.tenant_id == tenant_id, SubscriptionPayment.status == "paid",
    ).one_or_none()
    return PaymentStatusOut(status="paid" if paid else "pending")


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
