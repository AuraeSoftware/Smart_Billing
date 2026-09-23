from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User, UserRole
from app.models.device import DeviceSession

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
