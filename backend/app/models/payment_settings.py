import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class PlatformPaymentSettings(Base):
    """
    Singleton row (there is only ever one) holding the platform-level payment
    instructions Aurae publishes to its tenants — bank details, UPI ID,
    supported gateways, notes. Mirrors Smart Garage 360's "Payment Settings"
    page. The Supreme Admin edits it; every Super Admin sees a read-only
    copy via /account/payment-settings.
    """
    __tablename__ = "platform_payment_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    bank_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ifsc_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    upi_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    supported_gateways: Mapped[str | None] = mapped_column(String(255), nullable=True)  # comma-separated
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Payment gateway credentials (Razorpay) used to collect subscription
    # payments from tenants — Smart Garage 360's actual "Payment Settings"
    # page. Secrets are write-only from the API: a read always masks them.
    razorpay_key_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    razorpay_key_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TenantPaymentGateway(Base):
    """
    A tenant's own Razorpay credentials, used to collect payments from
    their customers at invoice checkout — the Super Admin's copy of the
    same "Payment Settings" concept, scoped to their own tenant.
    """
    __tablename__ = "tenant_payment_gateways"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    razorpay_key_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    razorpay_key_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    razorpay_webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
