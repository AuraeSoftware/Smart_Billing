"""Small shared input checks, so the API refuses the same bad values the
screens do (letters in phone numbers, malformed PAN, and so on)."""
import re

_PHONE = re.compile(r"^\+?[0-9][0-9\s\-()]{3,19}$")
_PAN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")


def clean_phone(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    if not _PHONE.match(v) or not 7 <= len(re.sub(r"\D", "", v)) <= 15:
        raise ValueError("Phone number can only contain digits (7 to 15), with an optional + at the start.")
    return v


def clean_pan(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip().upper()
    if not v:
        return None
    if not _PAN.match(v):
        raise ValueError("PAN must be 10 characters: 5 letters, 4 digits, then 1 letter (for example ABCDE1234F).")
    return v


def clean_digits(value: str | None, label: str = "This field") -> str | None:
    if value is None:
        return None
    v = re.sub(r"[\s-]", "", value.strip())
    if not v:
        return None
    if not v.isdigit():
        raise ValueError(f"{label} can only contain digits.")
    return v


# National-number length (digits after the country code) per dial code.
COUNTRY_DIGITS: dict[str, tuple[int, int]] = {
    "91": (10, 10), "60": (9, 10), "65": (8, 8), "971": (9, 9), "61": (9, 9), "1": (10, 10), "44": (10, 10),
    "64": (8, 10), "966": (9, 9), "974": (8, 8), "965": (8, 8), "968": (8, 8), "973": (8, 8), "972": (8, 9),
    "92": (10, 10), "880": (10, 10), "94": (9, 9), "977": (10, 10), "62": (9, 12), "66": (9, 9), "84": (9, 10),
    "63": (10, 10), "82": (9, 10), "81": (10, 10), "86": (11, 11), "852": (8, 8), "41": (9, 9), "46": (7, 10),
    "47": (8, 8), "45": (8, 8), "48": (9, 9), "7": (10, 10), "90": (10, 10), "27": (9, 9), "234": (10, 10),
    "254": (9, 9), "20": (10, 10), "233": (9, 9), "55": (10, 11), "52": (10, 10), "54": (10, 10), "56": (9, 9),
    "57": (10, 10), "49": (10, 11), "33": (9, 9), "39": (9, 10), "34": (9, 9), "31": (9, 9), "32": (8, 9),
    "351": (9, 9), "353": (9, 9), "358": (9, 10), "30": (10, 10), "43": (10, 13), "420": (9, 9),
}


def check_international(value: str) -> str:
    """"+91 9876543210": digits only after the country code, with the length
    that country uses (10 for India, 8 for Singapore, and so on)."""
    v = value.strip()
    m = re.match(r"^\+(\d{1,3})\s+(\d+)$", v)
    if not m:
        raise ValueError("Enter the mobile number as digits only, after the country code.")
    dial, national = m.group(1), m.group(2)
    rng = COUNTRY_DIGITS.get(dial)
    if rng is None:
        rng = (6, 12)
    lo, hi = rng
    if not lo <= len(national) <= hi:
        want = f"{lo}" if lo == hi else f"{lo} to {hi}"
        raise ValueError(f"A +{dial} mobile number must have {want} digits.")
    return f"+{dial} {national}"
