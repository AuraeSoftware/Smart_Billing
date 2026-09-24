import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TenantGstSettings(Base):
    """
    A tenant's GST registration and default tax rates — Smart Garage 360's
    "GST Manager" sidebar page (superAdminOnly there too). One row per
    tenant, created lazily on first read.
    """
    __tablename__ = "tenant_gst_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)

    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(15), nullable=True)
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    place_of_supply: Mapped[str | None] = mapped_column(String(100), nullable=True)
    default_cgst_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    default_sgst_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    default_igst_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TenantTaxCode(Base):
    """
    An HSN/SAC code the tenant bills under, with its GST rate — a lookup
    list for quick reference and consistent invoicing, same spirit as
    Smart Garage 360's GST Manager code table.
    """
    __tablename__ = "tenant_tax_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    code: Mapped[str] = mapped_column(String(20), nullable=False)  # HSN or SAC code
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gst_rate_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
