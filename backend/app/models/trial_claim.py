import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class TrialClaim(Base):
    """
    One row per company that has ever used the trial plan — restricts trial
    signup to a single use per company, per the request to allow the trial
    "only one time for that company."

    This is a placeholder for real business-registration verification (the
    SSM check Smart Garage 360 does for Malaysian companies), which is
    deferred for now. Without a government registry to check against, the
    closest fair proxy for "one company" is its business name, normalized
    (lowercased, punctuation/whitespace stripped) so "Aurae Software
    Solutions" and "aurae software solutions!!" collide on the same key. A
    unique constraint on company_key means a second trial signup under a
    matching name is rejected before a tenant is ever created.

    Swap-in point for real verification later: replace normalize_company_key
    in app/services/trial.py with a lookup against the verified registration
    number returned by an SSM-equivalent check, and key this table on that
    number instead of the normalized name.
    """
    __tablename__ = "trial_claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    claimed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
