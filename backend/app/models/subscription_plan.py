import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, Integer, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SubscriptionPlan(Base):
    """
    A billing plan the Supreme Admin can offer tenants — mirrors Smart
    Garage 360's "Subscription Plans" sidebar page. Deliberately a plain
    table with a plain `billing_cycle` string column (not a Python enum) so
    creating it needs no new Postgres ENUM type and can never hit the
    double-create-on-table-creation bug the initial schema had to work
    around.
    """
    __tablename__ = "subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    billing_cycle: Mapped[str] = mapped_column(String(20), nullable=False, default="monthly")  # monthly | yearly
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    max_invoices_per_month: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Card accent + feature flags — mirrors Smart Garage 360's plan cards
    # (theme color swatch + a checklist of included modules).
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#da1a31")
    has_priority_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_api_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_advanced_reports: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_multi_currency: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
