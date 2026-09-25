"""
World currency reference data — used by the signup plan picker, the Supreme
Admin's Currency Configuration page, and the phone-number → currency
auto-detection at signup.

WORLD_CURRENCIES is not the full 180-code ISO 4217 list; it's the set of
currencies actually useful for a global tenant base (every G20 economy plus
the regions OS2 Studio's clients operate in — India, Malaysia, Singapore,
UAE, Australia — and the world's other major currency blocs). The Supreme
Admin can still add any other ISO code manually from Currency Configuration
(CurrencyRate.currency is free text, not constrained to this list).

DIAL_CODE_TO_CURRENCY maps a country's international calling code to its
currency, for auto-selecting a currency from the mobile number entered at
signup. Matching is longest-prefix-first (some dial codes share a leading
digit, e.g. "1" for the US/Canada/Caribbean vs "1242" for the Bahamas), so
callers should sort candidate prefixes by length descending — see
normalize_dial_code() below.
"""

WORLD_CURRENCIES: list[dict[str, str]] = [
    {"code": "INR", "name": "Indian Rupee"},
    {"code": "USD", "name": "US Dollar"},
    {"code": "EUR", "name": "Euro"},
    {"code": "GBP", "name": "British Pound"},
    {"code": "MYR", "name": "Malaysian Ringgit"},
    {"code": "SGD", "name": "Singapore Dollar"},
    {"code": "AED", "name": "UAE Dirham"},
    {"code": "AUD", "name": "Australian Dollar"},
    {"code": "CAD", "name": "Canadian Dollar"},
    {"code": "JPY", "name": "Japanese Yen"},
    {"code": "CNY", "name": "Chinese Yuan"},
    {"code": "HKD", "name": "Hong Kong Dollar"},
    {"code": "NZD", "name": "New Zealand Dollar"},
    {"code": "CHF", "name": "Swiss Franc"},
    {"code": "SEK", "name": "Swedish Krona"},
    {"code": "NOK", "name": "Norwegian Krone"},
    {"code": "DKK", "name": "Danish Krone"},
    {"code": "PLN", "name": "Polish Zloty"},
    {"code": "RUB", "name": "Russian Ruble"},
    {"code": "TRY", "name": "Turkish Lira"},
    {"code": "ZAR", "name": "South African Rand"},
    {"code": "NGN", "name": "Nigerian Naira"},
    {"code": "KES", "name": "Kenyan Shilling"},
    {"code": "EGP", "name": "Egyptian Pound"},
    {"code": "GHS", "name": "Ghanaian Cedi"},
    {"code": "SAR", "name": "Saudi Riyal"},
    {"code": "QAR", "name": "Qatari Riyal"},
    {"code": "KWD", "name": "Kuwaiti Dinar"},
    {"code": "OMR", "name": "Omani Rial"},
    {"code": "BHD", "name": "Bahraini Dinar"},
    {"code": "ILS", "name": "Israeli Shekel"},
    {"code": "PKR", "name": "Pakistani Rupee"},
    {"code": "BDT", "name": "Bangladeshi Taka"},
    {"code": "LKR", "name": "Sri Lankan Rupee"},
    {"code": "NPR", "name": "Nepalese Rupee"},
    {"code": "IDR", "name": "Indonesian Rupiah"},
    {"code": "THB", "name": "Thai Baht"},
    {"code": "VND", "name": "Vietnamese Dong"},
    {"code": "PHP", "name": "Philippine Peso"},
    {"code": "KRW", "name": "South Korean Won"},
    {"code": "BRL", "name": "Brazilian Real"},
    {"code": "MXN", "name": "Mexican Peso"},
    {"code": "ARS", "name": "Argentine Peso"},
    {"code": "CLP", "name": "Chilean Peso"},
    {"code": "COP", "name": "Colombian Peso"},
]

# Dial code -> ISO 4217 currency. Deliberately not exhaustive (every UN
# member state would be ~195 entries); this covers the countries behind
# each currency above plus the largest eurozone/CFA-bloc members, which is
# what the auto-detect at signup actually needs.
DIAL_CODE_TO_CURRENCY: dict[str, str] = {
    "91": "INR",
    "1": "USD",  # also Canada; no separate CAD dial code to distinguish
    "44": "GBP",
    "60": "MYR",
    "65": "SGD",
    "971": "AED",
    "61": "AUD",
    "81": "JPY",
    "86": "CNY",
    "852": "HKD",
    "64": "NZD",
    "41": "CHF",
    "46": "SEK",
    "47": "NOK",
    "45": "DKK",
    "48": "PLN",
    "7": "RUB",
    "90": "TRY",
    "27": "ZAR",
    "234": "NGN",
    "254": "KES",
    "20": "EGP",
    "233": "GHS",
    "966": "SAR",
    "974": "QAR",
    "965": "KWD",
    "968": "OMR",
    "973": "BHD",
    "972": "ILS",
    "92": "PKR",
    "880": "BDT",
    "94": "LKR",
    "977": "NPR",
    "62": "IDR",
    "66": "THB",
    "84": "VND",
    "63": "PHP",
    "82": "KRW",
    "55": "BRL",
    "52": "MXN",
    "54": "ARS",
    "56": "CLP",
    "57": "COP",
    # Eurozone
    "49": "EUR", "33": "EUR", "39": "EUR", "34": "EUR", "31": "EUR",
    "32": "EUR", "351": "EUR", "353": "EUR", "358": "EUR", "30": "EUR",
    "43": "EUR", "420": "EUR",
}


def normalize_dial_code(raw_phone: str) -> str | None:
    """Extracts a mobile number's leading digits and matches the longest dial
    code prefix on record. raw_phone can be "+91 98765 43210", "0091...",
    or just "9198765...". Returns None if nothing matches."""
    digits = "".join(ch for ch in raw_phone if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    for length in (3, 2, 1):
        prefix = digits[:length]
        if prefix in DIAL_CODE_TO_CURRENCY:
            return prefix
    return None


def currency_for_phone(raw_phone: str) -> str | None:
    code = normalize_dial_code(raw_phone)
    return DIAL_CODE_TO_CURRENCY.get(code) if code else None
