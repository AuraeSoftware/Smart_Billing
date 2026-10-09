import uuid
from datetime import datetime
from typing import Optional

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
    # Nullable = unlimited (see app/services/usage.py, which already treats a
    # None limit as "no cap"); every existing comparison against this column
    # has been made None-safe alongside this change.
    max_invoices_per_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Marks this as the free trial tier. A trial plan skips the payment step
    # at signup, but is capped to one claim per company — see TrialClaim.
    is_trial: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Informational only (shown on the signup page as "N-day free trial");
    # no automatic expiry/conversion-to-paid is implemented — the trial plan
    # itself stays free-until-manually-upgraded, exactly as it already works.
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)

    # Branch/product quotas — same "None = unlimited" convention as
    # max_invoices_per_month above.
    max_branches: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_products: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Card accent + feature flags — mirrors Smart Garage 360's plan cards
    # (theme color swatch + a checklist of included modules). These are
    # informational/display flags only, same as the four below them — no
    # backend route currently gates access on any of them.
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#da1a31")
    has_priority_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_api_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_advanced_reports: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_multi_currency: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_employee_management: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # NOTE: expense tracking and multi-branch are NOT implemented product
    # features yet (no module exists for either) — these flags are plan
    # metadata only, for when those modules are built. The frontend must
    # not present them as available today; see SubscribeSignup.tsx.
    has_expense_tracking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    has_multi_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # "none" | "basic" | "included" — plain string, same reasoning as
    # billing_cycle above (no new Postgres ENUM type).
    inventory_tier: Mapped[str] = mapped_column(String(20), nullable=False, default="included")
    role_permissions_tier: Mapped[str] = mapped_column(String(20), nullable=False, default="none")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
