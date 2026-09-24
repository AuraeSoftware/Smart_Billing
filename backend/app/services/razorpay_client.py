"""
Minimal Razorpay REST client for collecting a tenant's subscription payment.

Deliberately dependency-free — urllib from the standard library, not the
razorpay SDK or requests — since this only needs two calls (create an order,
verify a signature) and the project avoids adding a package for that.
Uses Aurae's platform-level credentials (PlatformPaymentSettings), which the
Supreme Admin configures under Payment Settings.
"""
import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

RAZORPAY_API_BASE = "https://api.razorpay.com/v1"


class RazorpayError(Exception):
    pass


def _auth_header(key_id: str, key_secret: str) -> str:
    token = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    return f"Basic {token}"


def create_order(*, key_id: str, key_secret: str, amount_minor: int, currency: str, receipt: str) -> dict:
    """amount_minor is the amount in the currency's smallest unit (e.g. paise
    for INR, sen for MYR) — Razorpay always expects an integer minor unit."""
    payload = json.dumps({"amount": amount_minor, "currency": currency, "receipt": receipt}).encode()
    req = urllib.request.Request(
        f"{RAZORPAY_API_BASE}/orders",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": _auth_header(key_id, key_secret)},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="ignore")
        raise RazorpayError(f"Razorpay order creation failed: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RazorpayError(f"Could not reach Razorpay: {exc}") from exc


def verify_signature(*, key_secret: str, order_id: str, payment_id: str, signature: str) -> bool:
    """Per Razorpay's documented checkout-verification scheme: HMAC-SHA256 of
    "order_id|payment_id" using the key secret, compared to the signature
    the Checkout success handler returns. Constant-time compare deliberately."""
    expected = hmac.new(
        key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
