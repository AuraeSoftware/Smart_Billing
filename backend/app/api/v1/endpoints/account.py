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
from app.models.payment_settings import PlatformPaymentSettings
from app.services.device_binding import deregister_device

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

    class Config:
        from_attributes = True


@router.get("/payment-settings", response_model=PaymentSettingsOut | None)
def get_payment_settings(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    """Read-only view of the platform payment instructions Aurae publishes —
    the Supreme Admin's copy (app.api.v1.endpoints.admin) is the editable one."""
    return db.query(PlatformPaymentSettings).first()


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
