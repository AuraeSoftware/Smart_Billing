"""
Rerunnable script that makes sure the free trial plan exists, is active, and
runs for 60 days (the 2-month demo shown on the signup page).

- If a trial plan (is_trial = True) already exists, it is reactivated if it
  was switched off and its trial_days is set to 60. Nothing else about it
  (name, quotas, tenants on it, billing history) is changed.
- If none exists, a "Free Trial" plan is created with Starter-level limits.

It never touches the paid Starter / Business / Pro / Enterprise plans, and
never deletes anything. Trial rules are unchanged: no payment step, one
claim per company (see app/services/trial.py).

Run on Railway from the backend service's shell, same as seed_packages.py:

    /opt/venv/bin/python scripts/seed_trial_plan.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.subscription_plan import SubscriptionPlan  # noqa: E402

TRIAL_DAYS = 60


def main():
    db = SessionLocal()
    try:
        plan = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.is_trial.is_(True))
            .order_by(SubscriptionPlan.created_at)
            .first()
        )
        if plan is None:
            plan = SubscriptionPlan(
                name="Free Trial",
                description="Try Smart Billing free for 2 months. No card required.",
                currency="INR",
                price=0,
                billing_cycle="monthly",
                max_users=2,
                max_invoices_per_month=100,
                max_branches=1,
                max_products=250,
                is_active=True,
                is_trial=True,
                trial_days=TRIAL_DAYS,
                color="#2563eb",
                has_multi_currency=True,
                inventory_tier="basic",
                role_permissions_tier="none",
            )
            db.add(plan)
            action = "Created"
        else:
            plan.is_active = True
            plan.trial_days = TRIAL_DAYS
            db.add(plan)
            action = "Updated"
        db.commit()
        print(f"{action}: {plan.name!r} (id={plan.id}) - active, {TRIAL_DAYS}-day free trial.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
