import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Customer(Base):
    """
    SB04 — a real, per-tenant customer entity. Before this, Invoice/Quotation
    only ever carried a plain customer_name/customer_email string with no FK,
    and the "Customers" page (see analytics.py's tenant_customers) was a
    GROUP BY aggregation over those strings rather than a real table.

    This is purely additive: Invoice.customer_name / Quotation.customer_name
    stay exactly as they were (still required, still what prints on PDFs and
    what the existing Customers aggregation reads), and Customer rows are
    created/matched automatically alongside them (see invoices.py /
    quotations.py create_* endpoints) so nothing that already worked changes
    behavior — this just gives a durable record to attach to going forward
    (and an FK for new code, like a searchable picker, to use).
    """
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
