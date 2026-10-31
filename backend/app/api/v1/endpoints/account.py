"""Self-service account actions for the logged-in user — the Super Admin's
"Credentials"/"Payment Settings"/"My Plan" sidebar pages in Smart Billing,
matching Smart Garage 360's tenant-side equivalents."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin, require_tenant_staff, current_tenant_id, current_tenant_id_allow_expired
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.models.tenant import Tenant
from app.models.subscription_plan import SubscriptionPlan
from app.models.payment_settings import PlatformPaymentSettings, TenantPaymentGateway
from app.services.device_binding import deregister_device
from app.services.usage import usage_snapshot
from app.services.plan_expiry import is_expired, days_left
from app.models.upgrade_request import PlanUpgradeRequest
from app.services.subscription_events import log_subscription_event

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
    plan_max_branches: int | None
    plan_max_products: int | None
    plan_has_priority_support: bool = False
    plan_has_advanced_reports: bool = False
    plan_has_employee_management: bool = False
    plan_inventory_tier: str | None = None
    plan_role_permissions_tier: str | None = None
    plan_is_trial: bool = False
    plan_expires_at: str | None = None
    days_left: int | None = None
    expired: bool = False


@router.get("/my-plan", response_model=MyPlanOut)
def get_my_plan(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id_allow_expired),
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
        plan_max_branches=plan.max_branches if plan else None,
        plan_max_products=plan.max_products if plan else None,
        plan_has_priority_support=plan.has_priority_support if plan else False,
        plan_has_advanced_reports=plan.has_advanced_reports if plan else False,
        plan_has_employee_management=plan.has_employee_management if plan else False,
        plan_inventory_tier=plan.inventory_tier if plan else None,
        plan_role_permissions_tier=plan.role_permissions_tier if plan else None,
        plan_is_trial=bool(plan.is_trial) if plan else False,
        plan_expires_at=tenant.plan_expires_at.isoformat() if tenant.plan_expires_at else None,
        days_left=days_left(tenant),
        expired=is_expired(tenant),
    )


# ---------------------------------------------------------------------------
# Plan validity + upgrade / renewal requests
# ---------------------------------------------------------------------------

class PlanStatusOut(BaseModel):
    plan_name: str | None
    is_trial: bool
    expires_at: str | None
    days_left: int | None
    expired: bool
    can_request_upgrade: bool
    pending_request: bool


@router.get("/plan-status", response_model=PlanStatusOut)
def get_plan_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_tenant_staff),
    tenant_id: str = Depends(current_tenant_id_allow_expired),
):
    """Small, always-available status the dashboard checks on load: when the
    plan ends, whether it already has, and whether an upgrade is awaiting
    approval. Open to tenant staff too (so a locked staff login can say why)."""
    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none() if tenant.subscription_plan_id else None
    pending = db.query(PlanUpgradeRequest).filter(
        PlanUpgradeRequest.tenant_id == tenant.id, PlanUpgradeRequest.status == "pending"
    ).count() > 0
    return PlanStatusOut(
        plan_name=plan.name if plan else None,
        is_trial=bool(plan.is_trial) if plan else False,
        expires_at=tenant.plan_expires_at.isoformat() if tenant.plan_expires_at else None,
        days_left=days_left(tenant),
        expired=is_expired(tenant),
        can_request_upgrade=user.role.value == "super_admin",
        pending_request=pending,
    )


class UpgradeRequestIn(BaseModel):
    plan_id: uuid.UUID
    note: str | None = None


class UpgradeRequestOut(BaseModel):
    id: uuid.UUID
    status: str
    from_plan_name: str | None
    to_plan_name: str
    to_plan_price: float | None = None
    to_plan_currency: str | None = None
    to_plan_cycle: str | None = None
    note: str | None
    decision_note: str | None
    created_at: str
    decided_at: str | None


def _request_out(db: Session, r: PlanUpgradeRequest) -> UpgradeRequestOut:
    to_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == r.to_plan_id).one_or_none()
    from_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == r.from_plan_id).one_or_none() if r.from_plan_id else None
    return UpgradeRequestOut(
        id=r.id, status=r.status, from_plan_name=from_plan.name if from_plan else None,
        to_plan_name=to_plan.name if to_plan else "(removed plan)",
        to_plan_price=float(to_plan.price) if to_plan else None,
        to_plan_currency=to_plan.currency if to_plan else None,
        to_plan_cycle=to_plan.billing_cycle if to_plan else None,
        note=r.note, decision_note=r.decision_note,
        created_at=r.created_at.isoformat(), decided_at=r.decided_at.isoformat() if r.decided_at else None,
    )


@router.post("/upgrade-requests", response_model=UpgradeRequestOut, status_code=status.HTTP_201_CREATED)
def create_upgrade_request(
    payload: UpgradeRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id_allow_expired),
):
    """Ask the Supreme Admin to move this workspace to a plan (or renew the
    current one). The plan is NOT changed here — it only changes when the
    Supreme Admin approves."""
    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payload.plan_id, SubscriptionPlan.is_active.is_(True)).one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That plan isn't available.")
    if plan.is_trial:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The free trial can't be requested as an upgrade.")
    if db.query(PlanUpgradeRequest).filter(
        PlanUpgradeRequest.tenant_id == tenant.id, PlanUpgradeRequest.status == "pending"
    ).count():
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have an upgrade request awaiting approval.")
    req = PlanUpgradeRequest(
        tenant_id=tenant.id, from_plan_id=tenant.subscription_plan_id, to_plan_id=plan.id,
        note=(payload.note or None), requested_by_id=user.id,
    )
    db.add(req)
    log_subscription_event(
        db, tenant=tenant, event_type="upgrade_requested", changed_by=user,
        old_value=None, new_value=plan.name, note=payload.note,
    )
    db.commit()
    db.refresh(req)
    return _request_out(db, req)


@router.get("/upgrade-requests", response_model=list[UpgradeRequestOut])
def list_my_upgrade_requests(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id_allow_expired),
):
    rows = (
        db.query(PlanUpgradeRequest).filter(PlanUpgradeRequest.tenant_id == uuid.UUID(tenant_id))
        .order_by(PlanUpgradeRequest.created_at.desc()).limit(20).all()
    )
    return [_request_out(db, r) for r in rows]
