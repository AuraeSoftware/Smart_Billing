"""Per-tenant document numbering with financial-year reset (SOW 3.1)."""
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.billing import DocumentCounter


def current_financial_year(on: date) -> str:
    # India-style FY: April–March. Adjust here if a tenant needs a calendar-year scheme.
    if on.month >= 4:
        return f"{on.year}-{on.year + 1}"
    return f"{on.year - 1}-{on.year}"


def next_document_number(db: Session, *, tenant_id: uuid.UUID, doc_type: str, on: date, prefix: str | None = None) -> str:
    fy = current_financial_year(on)
    counter = (
        db.query(DocumentCounter)
        .filter(
            DocumentCounter.tenant_id == tenant_id,
            DocumentCounter.doc_type == doc_type,
            DocumentCounter.financial_year == fy,
        )
        .with_for_update()
        .one_or_none()
    )
    default_prefix = {"invoice": "INV", "quotation": "QTN", "receipt": "RCT"}.get(doc_type, "DOC")
    if counter is None:
        counter = DocumentCounter(
            tenant_id=tenant_id, doc_type=doc_type, financial_year=fy,
            prefix=prefix or default_prefix, last_sequence=0,
        )
        db.add(counter)
        db.flush()

    counter.last_sequence += 1
    db.add(counter)
    db.flush()

    return f"{counter.prefix}/{fy}/{counter.last_sequence:04d}"
