"""
Resolves what a plan actually costs in a given currency — shared by the
public plan picker (/subscription/plans) and the subscription payment order
(create_payment_order in subscription.py), so both always agree on price.
"""
from sqlalchemy.orm import Session

from app.models.subscription_plan import SubscriptionPlan
from app.models.currency_config import CurrencyRate, PlanCurrencyOverride


def resolve_plan_price(db: Session, plan: SubscriptionPlan, currency: str | None) -> tuple[str, float]:
    """Returns (currency, price) for `plan` in `currency`.

    Precedence: a manual PlanCurrencyOverride always wins (the Supreme Admin
    set an exact price for this plan+currency pair); otherwise convert via
    CurrencyRate, using the same convention Currency Configuration already
    uses (1 unit of the platform base currency, INR, = rate_vs_base units of
    the target currency); if neither exists, fall back to the plan's own
    native price/currency rather than guessing a conversion."""
    if not currency or currency.upper() == plan.currency.upper():
        return plan.currency, float(plan.price)

    currency = currency.upper()
    override = db.query(PlanCurrencyOverride).filter(
        PlanCurrencyOverride.plan_id == plan.id, PlanCurrencyOverride.currency == currency,
    ).one_or_none()
    if override is not None:
        return currency, float(override.price)

    rate = db.query(CurrencyRate).filter(CurrencyRate.currency == currency).one_or_none()
    if rate is not None:
        return currency, round(float(plan.price) * float(rate.rate_vs_base), 2)

    return plan.currency, float(plan.price)
