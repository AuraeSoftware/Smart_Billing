import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TenantBranding(Base):
    """
    Captured during the subscription/onboarding flow itself (SOW 3.4), not as a
    later settings step. A tenant's subscription_status cannot move to ACTIVE
    until logo_url is set — enforced in services/subscription.py.
    """
    __tablename__ = "tenant_branding"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False
    )

    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    header_url: Mapped[str] = mapped_column(String(500), nullable=True)
    footer_url: Mapped[str] = mapped_column(String(500), nullable=True)

    # Free-text footer content (bank details, terms) shown alongside/instead of a footer image.
    footer_text: Mapped[str] = mapped_column(String(2000), nullable=True)

    # Document look (all optional; defaults are applied in app/services/pdf.py).
    doc_paper_size: Mapped[str] = mapped_column(String(10), nullable=True)      # A4 | LETTER | LEGAL | A5
    doc_font: Mapped[str] = mapped_column(String(20), nullable=True)            # poppins | helvetica | times | courier
    doc_font_size: Mapped[int] = mapped_column(Integer, nullable=True)          # body text size in pt
    doc_accent_color: Mapped[str] = mapped_column(String(9), nullable=True)     # #RRGGBB
    doc_header_style: Mapped[str] = mapped_column(String(10), nullable=True)    # shape | image
    # "From" block details printed on every document.
    doc_address: Mapped[str] = mapped_column(String(500), nullable=True)
    doc_phone: Mapped[str] = mapped_column(String(50), nullable=True)
    doc_registration: Mapped[str] = mapped_column(String(200), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
