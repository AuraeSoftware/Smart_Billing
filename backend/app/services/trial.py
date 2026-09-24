"""
Trial-plan-once-per-company enforcement (the request: "if they choose trial
version it should be allowed only one time for that company"). See
TrialClaim's docstring for why this is a normalized-name proxy rather than
real business-registration verification (SSM-equivalent verification is
deferred for now).
"""
import re
import uuid

from sqlalchemy.orm import Session

from app.models.trial_claim import TrialClaim


class TrialAlreadyUsedError(Exception):
    pass


def normalize_company_key(business_name: str, fallback_email: str = "") -> str:
    key = re.sub(r"[^a-z0-9]+", "", business_name.strip().lower())
    if key:
        return key
    return re.sub(r"[^a-z0-9]+", "", fallback_email.strip().lower())


def assert_trial_available(db: Session, *, business_name: str, contact_email: str) -> str:
    """Call before creating the tenant. Raises TrialAlreadyUsedError if this
    company has already claimed a trial; otherwise returns the company_key
    to pass to claim_trial() once the tenant row exists."""
    key = normalize_company_key(business_name, contact_email)
    existing = db.query(TrialClaim).filter(TrialClaim.company_key == key).one_or_none()
    if existing is not None:
        raise TrialAlreadyUsedError(
            "This company has already used a trial plan. Please choose a paid plan to continue."
        )
    return key


def claim_trial(db: Session, *, company_key: str, tenant_id: uuid.UUID, business_name: str, contact_email: str) -> TrialClaim:
    claim = TrialClaim(
        company_key=company_key, tenant_id=tenant_id,
        business_name=business_name, contact_email=contact_email,
    )
    db.add(claim)
    return claim
