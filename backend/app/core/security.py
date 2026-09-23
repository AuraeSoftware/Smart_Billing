import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def new_device_token() -> str:
    """A stable identifier for a browser/device, generated client-side on first
    login and sent with every request thereafter. See frontend lib/device.ts."""
    return str(uuid.uuid4())


def create_access_token(*, subject: str, session_token: str, extra: Optional[dict] = None) -> str:
    """
    session_token is the value stored on DeviceSession.active_session_token.
    A token is only valid while it matches that stored value — this is what lets
    a new login from the registered device invalidate any older token (SOW 3.3).
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "sid": session_token, "exp": expire}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
