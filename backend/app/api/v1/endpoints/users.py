"""
Tenant staff management — SOW/Proposal: "Super Admin manages that tenant's
own users, roles, templates...". Scoped strictly to the caller's own tenant;
a Super Admin can only create/deactivate TENANT_USER accounts, never another
Super Admin or a Supreme Admin.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import require_super_admin, current_tenant_id
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.user import TenantUserCreate, TenantUserOut

router = APIRouter()


@router.get("", response_model=list[TenantUserOut])
def list_tenant_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    return (
        db.query(User)
        .filter(User.tenant_id == tenant_id, User.role == UserRole.TENANT_USER)
        .order_by(User.created_at.desc())
        .all()
    )


@router.post("", response_model=TenantUserOut, status_code=status.HTTP_201_CREATED)
def create_tenant_user(
    payload: TenantUserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    if db.query(User).filter(User.email == payload.email).one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered.")
    user = User(
        tenant_id=tenant_id, email=payload.email, full_name=payload.full_name,
        hashed_password=hash_password(payload.password), role=UserRole.TENANT_USER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/deactivate")
def deactivate_tenant_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    user = db.query(User).filter(
        User.id == user_id, User.tenant_id == tenant_id, User.role == UserRole.TENANT_USER
    ).one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant user not found.")
    user.is_active = False
    db.add(user)
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reactivate")
def reactivate_tenant_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
    tenant_id: str = Depends(current_tenant_id),
):
    user = db.query(User).filter(
        User.id == user_id, User.tenant_id == tenant_id, User.role == UserRole.TENANT_USER
    ).one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant user not found.")
    user.is_active = True
    db.add(user)
    db.commit()
    return {"ok": True}
