import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, Enum, ForeignKey, func, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class UserRole(str, enum.Enum):
    SUPREME_ADMIN = "supreme_admin"   # Aurae — platform-wide
    SUPER_ADMIN = "super_admin"       # per-tenant owner — device-bound login (SOW 3.3)
    TENANT_USER = "tenant_user"       # tenant staff — not device-bound


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Null for supreme_admin (platform-level, not scoped to a tenant).
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Captured at signup for Super Admins — its country calling code drives
    # the automatic currency/plan-price selection (see app/core/currencies.py).
    # Nullable: existing users predate this field, and Supreme Admins never set one.
    mobile_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, values_callable=lambda enum_cls: [e.value for e in enum_cls]), nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # SOW 3.3: a suspended Super Admin credential is blocked at login even if the
    # password is correct. Only the Supreme Admin can set/clear this.
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
