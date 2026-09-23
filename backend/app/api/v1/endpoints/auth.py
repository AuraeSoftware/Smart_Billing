import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User
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
    )
