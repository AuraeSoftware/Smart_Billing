"""
Implements SOW Section 3.3 — Device-Bound Authentication & Session Control.

Rules encoded here:
  * A Super Admin credential is registered against exactly one device at a time.
  * A login from a second device is blocked by default; the current device must
    be explicitly de-registered (by the Super Admin themselves, or by the
    Supreme Admin on their behalf) before a new one can register.
  * A successful login from the registered device invalidates any other
    lingering session token — enforced by session_token equality checks in
    api/deps.py, not just at login time.
  * Every registration/de-registration/suspend event is written to DeviceEvent,
    which only the Supreme Admin can read (see api/v1/endpoints/admin.py).
  * Tenant users (role=TENANT_USER) and the Supreme Admin are NOT subject to
    this restriction — it applies to SUPER_ADMIN accounts only.
"""
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.device import DeviceSession, DeviceEvent, DeviceEventType
from app.models.user import User, UserRole
from app.core.security import new_device_token as _unused  # re-exported for convenience


class DeviceBindingError(Exception):
    def __init__(self, message: str, code: str = "device_blocked"):
        self.message = message
        self.code = code
        super().__init__(message)


def attempt_login(db: Session, *, user: User, device_token: str, device_label: str, session_token: str) -> None:
    """Raises DeviceBindingError if this login must be blocked. Otherwise
    registers/refreshes the device binding and writes the audit event."""
    if user.role != UserRole.SUPER_ADMIN:
        return  # restriction applies to Super Admin only, per SOW 3.3

    if user.is_suspended:
        raise DeviceBindingError(
            "This account has been suspended by the platform administrator.", code="suspended"
        )

    existing = db.query(DeviceSession).filter(DeviceSession.user_id == user.id).one_or_none()

    if existing is None:
        # First-ever login for this credential: register this device.
        db.add(DeviceSession(
            user_id=user.id, device_token=device_token, device_label=device_label,
            active_session_token=session_token,
        ))
        _log_event(db, user, DeviceEventType.REGISTERED, device_label, "Initial device registration.")
        return

    if existing.device_token != device_token:
        # A different device is trying to log in while one is already registered.
        _log_event(
            db, user, DeviceEventType.LOGIN_BLOCKED_OTHER_DEVICE, device_label,
            f"Blocked login attempt from a new device while '{existing.device_label}' is registered.",
        )
        raise DeviceBindingError(
            "This account is already registered to another device. "
            "Ask your platform administrator to de-register it before signing in here.",
            code="device_mismatch",
        )

    # Same device logging back in: refresh the active session token so any
    # older token (e.g. left open in another tab/session) stops working.
    existing.active_session_token = session_token
    existing.device_label = device_label
    db.add(existing)


def deregister_device(db: Session, *, user: User, actor: User) -> None:
    """actor is whoever performed the action — the Super Admin themselves, or
    the Supreme Admin acting on their behalf."""
    existing = db.query(DeviceSession).filter(DeviceSession.user_id == user.id).one_or_none()
    if existing:
        db.delete(existing)
    by = "self" if actor.id == user.id else f"supreme admin ({actor.email})"
    _log_event(db, user, DeviceEventType.DEREGISTERED, None, f"De-registered by {by}.")


def suspend_credential(db: Session, *, user: User, supreme_admin: User) -> None:
    """SOW 3.3: from the device-change alert, the Supreme Admin may suspend the
    Super Admin credential directly."""
    user.is_suspended = True
    db.add(user)
    _log_event(
        db, user, DeviceEventType.SUSPENDED_BY_SUPREME_ADMIN, None,
        f"Suspended by supreme admin ({supreme_admin.email}).",
    )


def reactivate_credential(db: Session, *, user: User, supreme_admin: User) -> None:
    user.is_suspended = False
    db.add(user)
    _log_event(
        db, user, DeviceEventType.REACTIVATED_BY_SUPREME_ADMIN, None,
        f"Reactivated by supreme admin ({supreme_admin.email}).",
    )


def _log_event(db: Session, user: User, event_type: DeviceEventType, device_label: Optional[str], detail: str) -> None:
    db.add(DeviceEvent(
        user_id=user.id, tenant_id=user.tenant_id, event_type=event_type,
        device_label=device_label, detail=detail,
    ))
