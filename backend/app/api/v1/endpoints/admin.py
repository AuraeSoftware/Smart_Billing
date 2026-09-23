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
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.device import DeviceEvent, DeviceEventType
from app.schemas.tenant import TenantOut
from app.services.device_binding import suspend_credential, reactivate_credential, deregister_device

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
