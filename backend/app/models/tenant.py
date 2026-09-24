import uuid
import enum
from datetime import datetime

from sqlalchemy import String, DateTime, Enum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SubscriptionStatus(str, enum.Enum):
    PENDING_ONBOARDING = "pending_onboarding"  # signed up, branding step not yet complete
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class Tenant(Base):
    """
    A tenant is one Aurae client business using Smart Billing. All billing
    documents, users, and branding are scoped to a tenant_id — this is the
    isolation boundary referenced throughout the SOW (Section 3.2).
    """
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)

    # A tenant cannot be marked ACTIVE until its branding step (logo/header/footer)
    # is complete — enforced in the subscription service, not just the UI.
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, values_callable=lambda enum_cls: [e.value for e in enum_cls]),
        default=SubscriptionStatus.PENDING_ONBOARDING, nullable=False,
    )

    # Billing/plan attributes — plain string currency (ISO 4217 code, e.g.
    # "INR"/"USD"), no Python enum, so it can be added as an ordinary column
    # without any new Postgres ENUM type.
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    subscription_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
