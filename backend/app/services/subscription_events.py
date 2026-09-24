"""
Subscription-history audit log — same pattern as app/services/device_binding.py's
_log_event: append-only, caller commits. Every place a tenant's subscription
state changes (signup, branding activation, suspend/reactivate, plan or
currency change) calls log_subscription_event() so the Supreme Admin's
"Subscription History" page has a complete trail.
"""
import uuid

from sqlalchemy.orm import Session

from app.models.subscription_event import TenantSubscriptionEvent
from app.models.tenant import Tenant
from app.models.user import User


def log_subscription_event(
    db: Session,
    *,
    tenant: Tenant,
    event_type: str,
    old_value: str | None = None,
    new_value: str | None = None,
    note: str | None = None,
    changed_by: User | None = None,
) -> TenantSubscriptionEvent:
    event = TenantSubscriptionEvent(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        event_type=event_type,
        old_value=old_value,
        new_value=new_value,
        note=note,
        changed_by_id=changed_by.id if changed_by else None,
        changed_by_label=changed_by.full_name if changed_by else "system",
    )
    db.add(event)
    return event
