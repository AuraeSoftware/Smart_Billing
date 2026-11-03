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
