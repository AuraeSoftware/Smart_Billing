import uuid
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, func, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class DeviceEventType(str, enum.Enum):
    REGISTERED = "registered"
    LOGIN_BLOCKED_OTHER_DEVICE = "login_blocked_other_device"
    DEREGISTERED = "deregistered"
    RE_REGISTERED = "re_registered"
    SUSPENDED_BY_SUPREME_ADMIN = "suspended_by_supreme_admin"
    REACTIVATED_BY_SUPREME_ADMIN = "reactivated_by_supreme_admin"


class DeviceSession(Base):
    """
    One active registered device per Super Admin credential (SOW 3.3).
    A row here is the *current* binding; login from any other device_token
    is rejected until this row is cleared via the de-registration flow.
    """
    __tablename__ = "device_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )

    device_token: Mapped[str] = mapped_column(String(255), nullable=False)
    device_label: Mapped[str] = mapped_column(String(255), nullable=True)  # e.g. "Chrome on Windows"

    # The single active session token; any prior token for this user is invalidated
    # the moment a new one is issued from the registered device (SOW 3.3).
    active_session_token: Mapped[str] = mapped_column(String(255), nullable=False)

    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DeviceEvent(Base):
    """
    Append-only audit log of device-binding activity. Per SOW 3.3, this log is
    visible ONLY to the Supreme Admin — Super Admins have no read access to it
    (enforced in the API layer, see api/v1/endpoints/admin.py).
    """
    __tablename__ = "device_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    event_type: Mapped[DeviceEventType] = mapped_column(
        Enum(DeviceEventType, values_callable=lambda enum_cls: [e.value for e in enum_cls]), nullable=False
    )
    device_label: Mapped[str] = mapped_column(String(255), nullable=True)
    detail: Mapped[str] = mapped_column(String(500), nullable=True)

    # Set when the Supreme Admin has viewed this event in the dashboard alert feed.
    acknowledged: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
