"""
One-off / rerunnable script: populates CurrencyRate for every currency in
WORLD_CURRENCIES with today's live exchange rate against INR — exactly what
clicking "Refresh live rates" on the Supreme Admin's Currency Configuration
page does, just run once from the backend shell instead of by hand.

Why this is needed: the public signup page already auto-detects a visitor's
currency from their mobile number's country code (see
app/core/currencies.py), and /subscription/plans already resolves each
plan's price into that currency (see app/services/pricing.py) — but that
resolution falls back silently to the plan's own native currency (INR)
whenever neither a manual PlanCurrencyOverride nor a CurrencyRate row exists
for the visitor's currency. seed_packages.py already sets exact manual
overrides for India (INR) and Malaysia (MYR) per the pricing proposal, but
until a CurrencyRate exists for the other markets (Singapore, UAE,
Australia, and everywhere else), a visitor from any of them still sees INR
pricing — the country-code detection runs, there's just nothing for it to
resolve into. This script closes that gap for every currency at once.

Manual overrides (already set by seed_packages.py for INR/MYR, and whatever
the Supreme Admin later sets by hand in Currency Configuration) always take
precedence over the computed rate regardless — see resolve_plan_price's
documented precedence — so running this never changes an existing tenant's
agreed price, and rerunning it later to pick up fresh rates is always safe.

Run on Railway, same way as seed_packages.py:

    /opt/venv/bin/python scripts/seed_currency_rates.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import SessionLocal  # noqa: E402
from app.models.currency_config import CurrencyRate  # noqa: E402
from app.core.currencies import WORLD_CURRENCIES  # noqa: E402
from app.services.fx_client import fetch_live_rates, FxRateError  # noqa: E402


def main():
    try:
        live = fetch_live_rates("INR")
    except FxRateError as exc:
        print(f"Could not reach the exchange rate service: {exc}")
        print("Nothing was changed — rerun this once the service is reachable.")
        sys.exit(1)

    db = SessionLocal()
    created, updated, skipped = 0, 0, 0
    try:
        for c in WORLD_CURRENCIES:
            code = c["code"]
            if code == "INR":
                continue  # the platform base currency — always rate 1, nothing to store
            if code not in live:
                print(f"Skipping {code}: not in the live rate response.")
                skipped += 1
                continue
            row = db.query(CurrencyRate).filter(CurrencyRate.currency == code).one_or_none()
            if row is None:
                row = CurrencyRate(currency=code, rate_vs_base=live[code])
                db.add(row)
                created += 1
            else:
                row.rate_vs_base = live[code]
                db.add(row)
                updated += 1
        db.commit()
        print(f"Done. {created} currency rate(s) created, {updated} updated, {skipped} skipped.")
        print("India and Malaysia keep their exact manual prices (set by seed_packages.py) — "
              "this only fills in conversion rates for every other market.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
