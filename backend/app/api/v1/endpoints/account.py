"""Self-service account actions for the logged-in user."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin
from app.models.user import User
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
