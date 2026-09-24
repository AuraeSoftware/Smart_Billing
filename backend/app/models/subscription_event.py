import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TenantSubscriptionEvent(Base):
    """
    Audit trail for everything that changes a tenant's subscription state —
    the "Subscription History" page in Smart Garage 360. Mirrors the
    DeviceEvent pattern in app/models/device.py: plain string event_type
    (no Postgres ENUM), written via app.services.subscription_events, never
    edited after the fact.
    """
    __tablename__ = "tenant_subscription_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    # e.g. "signed_up", "activated", "suspended", "reactivated", "cancelled",
    # "plan_changed", "currency_changed"
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    old_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    new_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Who made the change — null when the system did it automatically (e.g.
    # the tenant's own onboarding signup).
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_by_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
