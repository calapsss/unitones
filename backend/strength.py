"""Staffing fill-up, independently computed from the roster and declared TO."""
from decimal import Decimal

AETC_TO = {
    "authority": "Strength.xlsx · TO S-2025 · F77:I77",
    "counts": {"Officer": 356, "EP": 1000, "Civilian": 125, "Unclassified": 0},
}


def strength(actual, authorized):
    if not authorized or authorized < 0:
        return {"actual": actual, "authorized": authorized, "fill_rate": None, "rating": None}
    rate = Decimal(actual) * 100 / Decimal(authorized)
    rating = ("R1" if rate >= 85 else "R2" if rate >= Decimal("74.5") else
              "R3" if rate >= Decimal("50.51") else "R4" if rate <= Decimal("50.5") else "Review")
    return {"actual": actual, "authorized": authorized, "fill_rate": float(round(rate, 2)), "rating": rating}
