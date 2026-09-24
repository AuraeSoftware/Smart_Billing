"""
Supreme Admin console — platform-wide tenant management plus the device-event
alert feed and suspend action from SOW 3.3. Every route here requires the
SUPREME_ADMIN role; a Super Admin has no access to any of it, including the
device log, by design.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_supreme_admin
from app.models.tenant import Tenant, SubscriptionStatus
from app.models.user import User, UserRole
from app.models.device import DeviceEvent, DeviceEventType
from app.models.subscription_plan import SubscriptionPlan
from app.models.subscription_event import TenantSubscriptionEvent
from app.models.payment_settings import PlatformPaymentSettings
from app.schemas.tenant import TenantOut
from app.services.device_binding import suspend_credential, reactivate_credential, deregister_device
from app.services.subscription_events import log_subscription_event

router = APIRouter()


@router.get("/tenants", response_model=list[TenantOut])
def list_tenants(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    return db.query(Tenant).order_by(Tenant.created_at.desc()).all()


class DeviceEventOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    tenant_id: uuid.UUID | None
    event_type: str
    device_label: str | None
    detail: str | None
    acknowledged: bool
    created_at: str

    class Config:
        from_attributes = True


@router.get("/device-events", response_model=list[DeviceEventOut])
def list_device_events(
    unacknowledged_only: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_supreme_admin),
):
    """The Supreme Admin's device-change alert feed (SOW 3.3). Not exposed to
    any Super Admin route — this is the only place this data is readable."""
    q = db.query(DeviceEvent).order_by(DeviceEvent.created_at.desc())
    if unacknowledged_only:
        q = q.filter(DeviceEvent.acknowledged.is_(False))
    return q.limit(200).all()


@router.post("/device-events/{event_id}/acknowledge")
def acknowledge_event(event_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    event = db.query(DeviceEvent).filter(DeviceEvent.id == event_id).one_or_none()
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found.")
    event.acknowledged = True
    db.add(event)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/suspend")
def suspend_super_admin(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    """SOW 3.3: from the device-change alert, the Supreme Admin can suspend the
    Super Admin credential directly."""
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.SUPER_ADMIN).one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Super Admin account not found.")
    suspend_credential(db, user=user, supreme_admin=admin)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reactivate")
def reactivate_super_admin(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.SUPER_ADMIN).one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Super Admin account not found.")
    reactivate_credential(db, user=user, supreme_admin=admin)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/deregister-device")
def deregister_super_admin_device(user_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    """Lets the Supreme Admin de-register a Super Admin's device on their
    behalf (SOW 3.3), e.g. when the Super Admin has lost/replaced their device."""
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.SUPER_ADMIN).one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Super Admin account not found.")
    deregister_device(db, user=user, actor=admin)
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Super Admins — Smart Garage 360's "Super Admins" sidebar page: every
# tenant's Super Admin account in one table, with tenant/plan/currency
# context and the existing suspend/reactivate/deregister actions.
# ---------------------------------------------------------------------------

class SuperAdminRow(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    is_active: bool
    is_suspended: bool
    tenant_id: uuid.UUID | None
    tenant_name: str | None
    tenant_status: str | None
    tenant_currency: str | None
    plan_name: str | None
    created_at: str

    class Config:
        from_attributes = True


@router.get("/super-admins", response_model=list[SuperAdminRow])
def list_super_admins(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    users = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).order_by(User.created_at.desc()).all()
    rows: list[SuperAdminRow] = []
    for u in users:
        tenant = db.query(Tenant).filter(Tenant.id == u.tenant_id).one_or_none() if u.tenant_id else None
        plan = None
        if tenant and tenant.subscription_plan_id:
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none()
        status_val = tenant.subscription_status.value if tenant and hasattr(tenant.subscription_status, "value") else (str(tenant.subscription_status) if tenant else None)
        rows.append(SuperAdminRow(
            id=u.id, full_name=u.full_name, email=u.email,
            is_active=u.is_active, is_suspended=u.is_suspended,
            tenant_id=tenant.id if tenant else None,
            tenant_name=tenant.name if tenant else None,
            tenant_status=status_val,
            tenant_currency=tenant.currency if tenant else None,
            plan_name=plan.name if plan else None,
            created_at=u.created_at.isoformat(),
        ))
    return rows


# ---------------------------------------------------------------------------
# Subscription Plans
# ---------------------------------------------------------------------------

class SubscriptionPlanOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    currency: str
    price: float
    billing_cycle: str
    max_users: int
    max_invoices_per_month: int
    is_active: bool
    tenant_count: int = 0

    class Config:
        from_attributes = True


class SubscriptionPlanIn(BaseModel):
    name: str
    description: str | None = None
    currency: str = "INR"
    price: float = 0
    billing_cycle: str = "monthly"
    max_users: int = 5
    max_invoices_per_month: int = 100
    is_active: bool = True


@router.get("/subscription-plans", response_model=list[SubscriptionPlanOut])
def list_subscription_plans(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.created_at.desc()).all()
    out = []
    for p in plans:
        count = db.query(Tenant).filter(Tenant.subscription_plan_id == p.id).count()
        out.append(SubscriptionPlanOut(
            id=p.id, name=p.name, description=p.description, currency=p.currency,
            price=float(p.price), billing_cycle=p.billing_cycle, max_users=p.max_users,
            max_invoices_per_month=p.max_invoices_per_month, is_active=p.is_active, tenant_count=count,
        ))
    return out


@router.post("/subscription-plans", response_model=SubscriptionPlanOut, status_code=status.HTTP_201_CREATED)
def create_subscription_plan(payload: SubscriptionPlanIn, db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    plan = SubscriptionPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return SubscriptionPlanOut(**{**payload.model_dump(), "id": plan.id, "price": float(plan.price), "tenant_count": 0})


@router.put("/subscription-plans/{plan_id}", response_model=SubscriptionPlanOut)
def update_subscription_plan(plan_id: uuid.UUID, payload: SubscriptionPlanIn, db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    for field, value in payload.model_dump().items():
        setattr(plan, field, value)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    count = db.query(Tenant).filter(Tenant.subscription_plan_id == plan.id).count()
    return SubscriptionPlanOut(
        id=plan.id, name=plan.name, description=plan.description, currency=plan.currency,
        price=float(plan.price), billing_cycle=plan.billing_cycle, max_users=plan.max_users,
        max_invoices_per_month=plan.max_invoices_per_month, is_active=plan.is_active, tenant_count=count,
    )


@router.delete("/subscription-plans/{plan_id}")
def deactivate_subscription_plan(plan_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    """Soft-delete: plans already assigned to tenants must stay resolvable,
    so this deactivates rather than removing the row."""
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).one_or_none()
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    plan.is_active = False
    db.add(plan)
    db.commit()
    return {"ok": True}


class AssignPlanRequest(BaseModel):
    plan_id: uuid.UUID | None = None  # null clears the tenant's plan


@router.post("/tenants/{tenant_id}/assign-plan")
def assign_plan(tenant_id: uuid.UUID, payload: AssignPlanRequest, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    old_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.subscription_plan_id).one_or_none() if tenant.subscription_plan_id else None
    new_plan = None
    if payload.plan_id is not None:
        new_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payload.plan_id).one_or_none()
        if new_plan is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Plan not found.")
    tenant.subscription_plan_id = payload.plan_id
    db.add(tenant)
    log_subscription_event(
        db, tenant=tenant, event_type="plan_changed", changed_by=admin,
        old_value=old_plan.name if old_plan else "none",
        new_value=new_plan.name if new_plan else "none",
    )
    db.commit()
    return {"ok": True}


class CurrencyRequest(BaseModel):
    currency: str


@router.put("/tenants/{tenant_id}/currency")
def set_tenant_currency(tenant_id: uuid.UUID, payload: CurrencyRequest, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    old_currency = tenant.currency
    tenant.currency = payload.currency.upper()
    db.add(tenant)
    log_subscription_event(
        db, tenant=tenant, event_type="currency_changed", changed_by=admin,
        old_value=old_currency, new_value=tenant.currency,
    )
    db.commit()
    return {"ok": True}


@router.post("/tenants/{tenant_id}/suspend")
def suspend_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    """Suspends the tenant's WHOLE workspace (subscription-level), distinct
    from /users/{id}/suspend which suspends a single Super Admin credential."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    old_status = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)
    tenant.subscription_status = SubscriptionStatus.SUSPENDED
    db.add(tenant)
    log_subscription_event(db, tenant=tenant, event_type="suspended", changed_by=admin, old_value=old_status, new_value="suspended")
    db.commit()
    return {"ok": True}


@router.post("/tenants/{tenant_id}/reactivate")
def reactivate_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    old_status = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)
    tenant.subscription_status = SubscriptionStatus.ACTIVE
    db.add(tenant)
    log_subscription_event(db, tenant=tenant, event_type="reactivated", changed_by=admin, old_value=old_status, new_value="active")
    db.commit()
    return {"ok": True}


@router.post("/tenants/{tenant_id}/cancel")
def cancel_tenant(tenant_id: uuid.UUID, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found.")
    old_status = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)
    tenant.subscription_status = SubscriptionStatus.CANCELLED
    db.add(tenant)
    log_subscription_event(db, tenant=tenant, event_type="cancelled", changed_by=admin, old_value=old_status, new_value="cancelled")
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Subscription History
# ---------------------------------------------------------------------------

class SubscriptionEventOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_name: str | None
    event_type: str
    old_value: str | None
    new_value: str | None
    note: str | None
    changed_by_label: str | None
    created_at: str


@router.get("/subscription-history", response_model=list[SubscriptionEventOut])
def subscription_history(
    tenant_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_supreme_admin),
):
    q = db.query(TenantSubscriptionEvent).order_by(TenantSubscriptionEvent.created_at.desc())
    if tenant_id is not None:
        q = q.filter(TenantSubscriptionEvent.tenant_id == tenant_id)
    events = q.limit(500).all()
    tenant_names = {t.id: t.name for t in db.query(Tenant).all()}
    return [
        SubscriptionEventOut(
            id=e.id, tenant_id=e.tenant_id, tenant_name=tenant_names.get(e.tenant_id),
            event_type=e.event_type, old_value=e.old_value, new_value=e.new_value,
            note=e.note, changed_by_label=e.changed_by_label, created_at=e.created_at.isoformat(),
        )
        for e in events
    ]


# ---------------------------------------------------------------------------
# Payment Settings — singleton row; created on first read if missing.
# ---------------------------------------------------------------------------

class PaymentSettingsOut(BaseModel):
    bank_name: str | None
    account_name: str | None
    account_number: str | None
    ifsc_code: str | None
    upi_id: str | None
    supported_gateways: str | None
    notes: str | None

    class Config:
        from_attributes = True


def _get_or_create_payment_settings(db: Session) -> PlatformPaymentSettings:
    settings_row = db.query(PlatformPaymentSettings).first()
    if settings_row is None:
        settings_row = PlatformPaymentSettings(id=uuid.uuid4())
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


@router.get("/payment-settings", response_model=PaymentSettingsOut)
def get_payment_settings(db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    return _get_or_create_payment_settings(db)


@router.put("/payment-settings", response_model=PaymentSettingsOut)
def update_payment_settings(payload: PaymentSettingsOut, db: Session = Depends(get_db), _: User = Depends(require_supreme_admin)):
    settings_row = _get_or_create_payment_settings(db)
    for field, value in payload.model_dump().items():
        setattr(settings_row, field, value)
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return settings_row


# ---------------------------------------------------------------------------
# Credentials — Supreme Admin's own self-service password change (the
# Super Admin equivalent lives in app.api.v1.endpoints.account).
# ---------------------------------------------------------------------------

class AdminChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def admin_change_password(payload: AdminChangePasswordRequest, db: Session = Depends(get_db), admin: User = Depends(require_supreme_admin)):
    from app.core.security import hash_password, verify_password
    if not verify_password(payload.current_password, admin.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be at least 8 characters.")
    admin.hashed_password = hash_password(payload.new_password)
    db.add(admin)
    db.commit()
    return {"ok": True}
