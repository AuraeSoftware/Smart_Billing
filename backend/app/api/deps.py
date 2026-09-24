from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.device import DeviceSession
from app.models.tenant import Tenant, SubscriptionStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token.")

    user_id = payload.get("sub")
    session_token = payload.get("sid")
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive.")

    if user.role == UserRole.SUPER_ADMIN:
        if user.is_suspended:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Account suspended by the platform administrator.")
        # SOW 3.3: this token is only valid while it matches the currently
        # registered device's session token. A newer login (same device,
        # refreshed token) or a de-registration invalidates every older token.
        device = db.query(DeviceSession).filter(DeviceSession.user_id == user.id).one_or_none()
        if device is None or device.active_session_token != session_token:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Session no longer valid — this device may have been de-registered or superseded.",
            )

    return user


def require_role(*roles: UserRole):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this resource.")
        return user
    return _dep


require_supreme_admin = require_role(UserRole.SUPREME_ADMIN)
require_super_admin = require_role(UserRole.SUPER_ADMIN)
require_tenant_staff = require_role(UserRole.SUPER_ADMIN, UserRole.TENANT_USER)


def current_tenant_id(user: User = Depends(get_current_user)) -> str:
    if user.tenant_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This account is not scoped to a tenant.")
    return str(user.tenant_id)


def require_active_tenant(db: Session = Depends(get_db), tenant_id: str = Depends(current_tenant_id)) -> str:
    """Gate for document-creation endpoints (invoices/quotations/receipts):
    a tenant that hasn't finished onboarding (branding + plan) yet, or has
    been suspended/cancelled by the Supreme Admin, can't create new
    documents — even though a Super Admin whose credential is otherwise
    fine can still log in and see a "finish setup" screen."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None or tenant.subscription_status != SubscriptionStatus.ACTIVE:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Your workspace isn't fully active yet — finish onboarding (branding + plan), "
            "or contact Aurae Software Solutions if you believe this is a mistake.",
        )
    return tenant_id
