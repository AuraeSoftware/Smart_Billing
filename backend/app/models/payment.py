import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SubscriptionPayment(Base):
    """
    One row per Razorpay order created for a tenant's own subscription fee —
    not to be confused with TenantPaymentGateway (app/models/payment_settings.py),
    which is a tenant's OWN Razorpay credentials for collecting money from
    THEIR customers at invoice checkout. This one uses Aurae's platform-level
    credentials (PlatformPaymentSettings) to collect the subscription payment
    itself, and gates tenant activation for any non-trial plan the same way
    branding does — see activate_tenant() in app/services/subscription.py.
    """
    __tablename__ = "subscription_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    subscription_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subscription_plans.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    gateway: Mapped[str] = mapped_column(String(30), nullable=False, default="razorpay")
    gateway_order_id: Mapped[str] = mapped_column(String(120), nullable=False)
    gateway_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gateway_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created")  # created | paid | failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
