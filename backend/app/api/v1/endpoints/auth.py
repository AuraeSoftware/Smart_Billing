import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User, UserRole
from app.models.tenant import Tenant, SubscriptionStatus
from app.schemas.auth import LoginRequest, TokenResponse
from app.services.device_binding import attempt_login, DeviceBindingError

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is inactive.")

    # A tenant's own credential can be fine while the workspace itself is
    # locked out — suspended/cancelled by the Supreme Admin. Those block the
    # login outright. "pending_onboarding" (branding/plan not finished yet)
    # is allowed through so the Super Admin can reach the dashboard and see
    # a "finish setup" prompt; document creation is what's actually gated
    # (see require_active_tenant), not the login itself.
    tenant_status_val: str | None = None
    if user.role in (UserRole.SUPER_ADMIN, UserRole.TENANT_USER):
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).one_or_none()
        if tenant is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Workspace not found.")
        if tenant.subscription_status in (SubscriptionStatus.SUSPENDED, SubscriptionStatus.CANCELLED):
            status_label = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This workspace has been {status_label} by the platform administrator. "
                "Contact Aurae Software Solutions LLP for help.",
            )
        tenant_status_val = tenant.subscription_status.value if hasattr(tenant.subscription_status, "value") else str(tenant.subscription_status)

    session_token = str(uuid.uuid4())

    try:
        attempt_login(
            db, user=user, device_token=payload.device_token,
            device_label=payload.device_label, session_token=session_token,
        )
    except DeviceBindingError as exc:
        db.commit()  # persist the blocked-attempt audit event even though login fails
        raise HTTPException(status.HTTP_403_FORBIDDEN, exc.message) from exc

    db.commit()

    token = create_access_token(subject=str(user.id), session_token=session_token)
    return TokenResponse(
        access_token=token, role=user.role.value,
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
        full_name=user.full_name,
        tenant_status=tenant_status_val,
    )
