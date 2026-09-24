"""Self-service account actions for the logged-in user — the Super Admin's
"Credentials"/"Payment Settings"/"My Plan" sidebar pages in Smart Billing,
matching Smart Garage 360's tenant-side equivalents."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin, current_tenant_id
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.tenant import Tenant
from app.models.subscription_plan import SubscriptionPlan
from app.models.payment_settings import PlatformPaymentSettings, TenantPaymentGateway
from app.services.device_binding import deregister_device
from app.services.usage import usage_snapshot

router = APIRouter()


@router.post("/deregister-device")
def deregister_own_device(db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    """SOW 3.3: the Super Admin may de-register their own current device (e.g.
    before switching to a new phone) without going through the Supreme Admin.
    The next login from any device then registers fresh."""
    deregister_device(db, user=user, actor=user)
    db.commit()
    return {"ok": True}


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(require_super_admin)):
    """Credentials page — self-service password change. Requires the current
    password so a hijacked session token alone can't lock the real owner out."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be at least 8 characters.")
    user.hashed_password = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    return {"ok": True}


class PaymentSettingsOut(BaseModel):
    bank_name: str | None
    account_name: str | None
    account_number: str | None
    ifsc_code: str | None
    upi_id: str | None
    supported_gateways: str | None
    notes: str | None
    gateway_available: bool = False


@router.get("/payment-settings", response_model=PaymentSettingsOut | None)
def get_payment_settings(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    """Read-only view of the platform payment instructions Aurae publishes —
    the Supreme Admin's copy (app.api.v1.endpoints.admin) is the editable
    one. Gateway secrets never leave the Supreme Admin's own endpoint —
    tenants only see whether a gateway is configured, not the keys."""
    s = db.query(PlatformPaymentSettings).first()
    if s is None:
        return None
    return PaymentSettingsOut(
        bank_name=s.bank_name, account_name=s.account_name, account_number=s.account_number,
        ifsc_code=s.ifsc_code, upi_id=s.upi_id, supported_gateways=s.supported_gateways, notes=s.notes,
        gateway_available=bool(s.razorpay_key_id and s.razorpay_key_secret),
    )


# ---------------------------------------------------------------------------
# Payment Gateway — the tenant's own Razorpay credentials, used to collect
# payments from their customers at invoice checkout (Smart Garage 360's
# "Payment Settings" page, tenant-scoped). Secrets are write-only.
# ---------------------------------------------------------------------------

_MASK = "••••••••"


class PaymentGatewayOut(BaseModel):
    razorpay_key_id: str | None
    razorpay_key_secret: str | None
    razorpay_webhook_secret: str | None


class PaymentGatewayIn(BaseModel):
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None


@router.get("/payment-gateway", response_model=PaymentGatewayOut)
def get_payment_gateway(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    gw = db.query(TenantPaymentGateway).filter(TenantPaymentGateway.tenant_id == uuid.UUID(tenant_id)).one_or_none()
    if gw is None:
        return PaymentGatewayOut(razorpay_key_id=None, razorpay_key_secret=None, razorpay_webhook_secret=None)
    return PaymentGatewayOut(
        razorpay_key_id=gw.razorpay_key_id,
        razorpay_key_secret=_MASK if gw.razorpay_key_secret else None,
        razorpay_webhook_secret=_MASK if gw.razorpay_webhook_secret else None,
    )


@router.put("/payment-gateway", response_model=PaymentGatewayOut)
def update_payment_gateway(
    payload: PaymentGatewayIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    gw = db.query(TenantPaymentGateway).filter(TenantPaymentGateway.tenant_id == uuid.UUID(tenant_id)).one_or_none()
    if gw is None:
        gw = TenantPaymentGateway(id=uuid.uuid4(), tenant_id=uuid.UUID(tenant_id))
    if payload.razorpay_key_id is not None:
        gw.razorpay_key_id = payload.razorpay_key_id
    if payload.razorpay_key_secret and payload.razorpay_key_secret != _MASK:
        gw.razorpay_key_secret = payload.razorpay_key_secret
    if payload.razorpay_webhook_secret and payload.razorpay_webhook_secret != _MASK:
        gw.razorpay_webhook_secret = payload.razorpay_webhook_secret
    db.add(gw)
    db.commit()
    db.refresh(gw)
    return PaymentGatewayOut(
        razorpay_key_id=gw.razorpay_key_id,
        razorpay_key_secret=_MASK if gw.razorpay_key_secret else None,
        razorpay_webhook_secret=_MASK if gw.razorpay_webhook_secret else None,
    )


class UsageOut(BaseModel):
    plan_name: str | None
    invoices_used: int
    invoices_limit: int | None
    usage_percent: float
    days_until_reset: int
    warning_level: str  # none | warning | critical | limit_reached


@router.get("/usage", response_model=UsageOut)
def get_usage(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    """Powers the Super Admin dashboard's usage banner — how many invoices
    they've created this calendar month against their plan's monthly limit,
    and how many days remain until it resets. Warned at 80%/95%, blocked at
    100% (the actual block lives in require_active_tenant/create_invoice;
    this just reports the same numbers so the UI can warn ahead of time)."""
    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none() if tenant.subscription_plan_id else None
    snap = usage_snapshot(db, tenant.id, plan)
    return UsageOut(plan_name=plan.name if plan else None, **snap)


class MyPlanOut(BaseModel):
    tenant_name: str
    subscription_status: str
    currency: str
    plan_name: str | None
    plan_description: str | None
    plan_price: float | None
    plan_billing_cycle: str | None
    plan_max_users: int | None
    plan_max_invoices_per_month: int | None


@router.get("/my-plan", response_model=MyPlanOut)
def get_my_plan(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    """My Plan page — the tenant's own subscription plan and currency,
    read-only (plan assignment stays a Supreme Admin action)."""
    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none() if tenant.subscription_plan_id else None
    status_val = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)
    return MyPlanOut(
        tenant_name=tenant.name,
        subscription_status=status_val,
        currency=tenant.currency,
        plan_name=plan.name if plan else None,
        plan_description=plan.description if plan else None,
        plan_price=float(plan.price) if plan else None,
        plan_billing_cycle=plan.billing_cycle if plan else None,
        plan_max_users=plan.max_users if plan else None,
        plan_max_invoices_per_month=plan.max_invoices_per_month if plan else None,
    )
