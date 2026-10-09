"""
One-off / rerunnable script that creates or updates the 8 subscription plans
(Starter / Business / Pro / Enterprise, each Monthly + Yearly) from the
"Smart Billing — India & Malaysia SaaS Pricing Proposal" document, with the
exact India (INR) and Malaysia (MYR) prices as a manual PlanCurrencyOverride
per plan — leaning entirely on the existing plan + currency-override system,
no new concepts.

Idempotent and safe to rerun: a plan is matched by (name, billing_cycle) and
updated in place rather than duplicated; existing plans with other names
(including any existing "Free Trial" plan) are left untouched.

Run once after the database is migrated to 0008:

    python scripts/seed_packages.py

On Railway, run it from the backend service's shell (Railway dashboard ->
service -> ... -> Run command), or locally against DATABASE_URL pointed at
the Railway Postgres instance (same pattern as create_supreme_admin.py).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.subscription_plan import SubscriptionPlan  # noqa: E402
from app.models.currency_config import PlanCurrencyOverride  # noqa: E402

# Plan-card accent colors — reusing the existing palette convention
# (SupremeExtras.tsx PLAN_COLORS) so these slot in visually unchanged.
COLORS = {
    "Starter": "#6b7280",
    "Business": "#da1a31",
    "Pro": "#2563eb",
    "Enterprise": "#111827",
}

DESCRIPTIONS = {
    "Starter": "Start Billing — for freelancers, home businesses and very small shops moving off handwritten bills, spreadsheets or WhatsApp billing.",
    "Business": "Run Smarter — the recommended plan for SMEs: everyday billing, inventory, employees, expenses, reporting and custom invoice branding.",
    "Pro": "Scale Your Business — for established businesses with larger inventory, more employees and up to three branches, with advanced controls and reporting.",
    "Enterprise": "Manage at Scale — for multi-location businesses needing higher limits, role controls and priority support.",
}

# One row per tier. Quotas/flags are shared between the Monthly and Yearly
# variant of the same tier — only price and billing_cycle differ.
TIERS = {
    "Starter": dict(
        max_users=2, max_invoices_per_month=100, max_products=250, max_branches=1,
        has_priority_support=False, has_api_access=False, has_advanced_reports=False,
        has_multi_currency=True, has_employee_management=False, has_expense_tracking=False,
        has_multi_branch=False, inventory_tier="basic", role_permissions_tier="none",
        monthly=dict(inr=199, myr=19), yearly=dict(inr=1999, myr=190),
    ),
    "Business": dict(
        max_users=5, max_invoices_per_month=500, max_products=1500, max_branches=1,
        has_priority_support=False, has_api_access=False, has_advanced_reports=True,
        has_multi_currency=True, has_employee_management=True, has_expense_tracking=True,
        has_multi_branch=False, inventory_tier="included", role_permissions_tier="basic",
        monthly=dict(inr=499, myr=49), yearly=dict(inr=4999, myr=490),
    ),
    "Pro": dict(
        max_users=15, max_invoices_per_month=2000, max_products=5000, max_branches=3,
        has_priority_support=True, has_api_access=False, has_advanced_reports=True,
        has_multi_currency=True, has_employee_management=True, has_expense_tracking=True,
        has_multi_branch=True, inventory_tier="included", role_permissions_tier="included",
        monthly=dict(inr=999, myr=99), yearly=dict(inr=9999, myr=990),
    ),
    "Enterprise": dict(
        max_users=40, max_invoices_per_month=None, max_products=None, max_branches=10,
        has_priority_support=True, has_api_access=False, has_advanced_reports=True,
        has_multi_currency=True, has_employee_management=True, has_expense_tracking=True,
        has_multi_branch=True, inventory_tier="included", role_permissions_tier="included",
        monthly=dict(inr=1999, myr=199), yearly=dict(inr=19999, myr=1990),
    ),
}


def _upsert_override(db, plan_id, currency: str, price: float) -> None:
    row = db.query(PlanCurrencyOverride).filter(
        PlanCurrencyOverride.plan_id == plan_id, PlanCurrencyOverride.currency == currency,
    ).one_or_none()
    if row is None:
        db.add(PlanCurrencyOverride(plan_id=plan_id, currency=currency, price=price))
    else:
        row.price = price
        db.add(row)


def main():
    db = SessionLocal()
    created, updated = 0, 0
    try:
        for tier_name, cfg in TIERS.items():
            for cycle in ("monthly", "yearly"):
                plan_name = f"{tier_name} ({cycle.capitalize()})"
                inr_price = cfg[cycle]["inr"]
                myr_price = cfg[cycle]["myr"]

                plan = db.query(SubscriptionPlan).filter(
                    SubscriptionPlan.name == plan_name, SubscriptionPlan.billing_cycle == cycle,
                ).one_or_none()
                is_new = plan is None
                if plan is None:
                    plan = SubscriptionPlan(name=plan_name)

                plan.description = DESCRIPTIONS[tier_name]
                plan.currency = "INR"
                plan.price = inr_price
                plan.billing_cycle = cycle
                plan.max_users = cfg["max_users"]
                plan.max_invoices_per_month = cfg["max_invoices_per_month"]
                plan.max_branches = cfg["max_branches"]
                plan.max_products = cfg["max_products"]
                plan.is_active = True
                plan.is_trial = False
                plan.trial_days = 14
                plan.color = COLORS[tier_name]
                plan.has_priority_support = cfg["has_priority_support"]
                plan.has_api_access = cfg["has_api_access"]
                plan.has_advanced_reports = cfg["has_advanced_reports"]
                plan.has_multi_currency = cfg["has_multi_currency"]
                plan.has_employee_management = cfg["has_employee_management"]
                plan.has_expense_tracking = cfg["has_expense_tracking"]
                plan.has_multi_branch = cfg["has_multi_branch"]
                plan.inventory_tier = cfg["inventory_tier"]
                plan.role_permissions_tier = cfg["role_permissions_tier"]

                db.add(plan)
                db.flush()  # ensure plan.id exists for the override rows below

                _upsert_override(db, plan.id, "MYR", myr_price)

                if is_new:
                    created += 1
                    print(f"Created: {plan_name} — INR {inr_price} / MYR {myr_price}")
                else:
                    updated += 1
                    print(f"Updated: {plan_name} — INR {inr_price} / MYR {myr_price}")

        db.commit()
        print(f"\nDone. {created} plan(s) created, {updated} plan(s) updated. "
              "Any existing Free Trial plan was left untouched.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
