"""
Live exchange rates — dependency-free, same house style as
app/services/razorpay_client.py (urllib, no new pip package for one GET
call). Uses open.er-api.com: free, no API key, updated daily, returns every
major currency's rate against a base currency in one request.
"""
import json
import urllib.error
import urllib.request

FX_API_BASE = "https://open.er-api.com/v6/latest"


class FxRateError(Exception):
    pass


def fetch_live_rates(base_currency: str = "INR") -> dict[str, float]:
    """Returns {currency_code: rate_vs_base}, e.g. {"USD": 0.012, ...} when
    base_currency="INR" — matches this app's CurrencyRate.rate_vs_base
    convention (1 unit of base = rate_vs_base units of that currency)."""
    url = f"{FX_API_BASE}/{base_currency.upper()}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError as exc:
        raise FxRateError(f"Could not reach the exchange rate service: {exc}") from exc

    if data.get("result") != "success" or "rates" not in data:
        raise FxRateError(f"Exchange rate service returned an unexpected response: {data.get('error-type', 'unknown error')}")
    return {k: float(v) for k, v in data["rates"].items()}
