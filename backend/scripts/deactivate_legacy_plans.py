"""
One-off / rerunnable cleanup script: deactivates any subscription plan that
is still marked active but isn't one of the 8 current Starter/Business/Pro/
Enterprise (Monthly+Yearly) plans seeded by seed_packages.py — in practice,
the old pre-redesign "Start" plan (INR 1500/month) that keeps showing up
alongside the real lineup on the public signup page and in the Supreme
Admin plan grid.

This never deletes a row (existing tenants on it, and its billing history,
stay intact) — it only sets is_active=False, which is exactly what the
"Deactivate" button in the Supreme Admin UI does, so it's safe to rerun and
easy to undo by flipping the plan back to active in that same UI if needed.

Run on Railway, same way as seed_packages.py:

    /opt/venv/bin/python scripts/deactivate_legacy_plans.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.subscription_plan import SubscriptionPlan  # noqa: E402

CURRENT_PLAN_NAMES = {
    f"{tier} ({cycle})"
    for tier in ("Starter", "Business", "Pro", "Enterprise")
    for cycle in ("Monthly", "Yearly")
}


def main():
    db = SessionLocal()
    try:
        stray = (
            db.query(SubscriptionPlan)
            .filter(SubscriptionPlan.is_active.is_(True))
            .filter(~SubscriptionPlan.name.in_(CURRENT_PLAN_NAMES))
            .filter(SubscriptionPlan.is_trial.is_(False))
            .all()
        )
        if not stray:
            print("Nothing to do — no stray active plans found outside the current 8.")
            return
        for plan in stray:
            print(f"Deactivating: {plan.name!r} ({plan.currency} {plan.price}/{plan.billing_cycle}, id={plan.id})")
            plan.is_active = False
            db.add(plan)
        db.commit()
        print(f"\nDone. Deactivated {len(stray)} plan(s). Any trial plan and the current 8 were left untouched.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
