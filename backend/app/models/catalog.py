import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Numeric, ForeignKey, Boolean, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class CatalogItem(Base):
    """
    A tenant's reusable service/product line item — Smart Garage 360's
    "Packages" (and "Products") sidebar page, adapted for billing: instead
    of a wash package, it's a saved item a Super Admin can drop straight
    into an invoice or quotation line without retyping price and tax.
    """
    __tablename__ = "catalog_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)  # e.g. "hr", "pc", "sq.ft"
    default_unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    default_tax_rate_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
