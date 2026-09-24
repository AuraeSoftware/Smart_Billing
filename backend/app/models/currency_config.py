import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class CurrencyRate(Base):
    """
    Exchange rate of one currency against the platform's base currency
    (INR) — Smart Garage 360's "Currency Config" page (exchange rates vs
    RM there, vs INR here since Aurae Software Solutions is India-based).
    """
    __tablename__ = "currency_rates"
    __table_args__ = (UniqueConstraint("currency", name="uq_currency_rates_currency"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    rate_vs_base: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlanCurrencyOverride(Base):
    """
    A manual price override for one plan in one currency — instead of
    relying purely on the exchange rate, the Supreme Admin can set an exact
    price a tenant in that currency sees. Same "Plan Overrides" concept as
    Smart Garage 360's Currency Config page.
    """
    __tablename__ = "plan_currency_overrides"
    __table_args__ = (UniqueConstraint("plan_id", "currency", name="uq_plan_currency_override"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subscription_plans.id", ondelete="CASCADE"), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
