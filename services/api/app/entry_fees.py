"""Park entry-fee quoting for pre-bookings (supervisor priority 5).

Unlike activity fees (which are per-activity rates in the database), the park
entry fee is a flat per-person charge that depends only on the visitor's
category. The amount due for a booking is that per-person fee multiplied by the
party size. All arithmetic is on integer minor units; no float ever touches
money, and the currency always matches the category (USD for the three foreign
categories, UGX for East African Citizens — build prompt Table 1).

These are sensible default gate rates; adjust the table to match the park's
current tariff.
"""

from dataclasses import dataclass

from app.models.enums import CATEGORY_CURRENCY, VisitorCategory

# Flat entry fee per person, in integer minor units of the category's currency
# (USD has 2 minor digits, UGX has 0). Defaults approximate Murchison Falls gate
# tariffs and are easy to edit in one place.
ENTRY_FEE_MINOR: dict[VisitorCategory, int] = {
    VisitorCategory.FNR: 4500,   # USD 45.00  Foreign Non-Resident
    VisitorCategory.FR: 3500,    # USD 35.00  Foreign Resident
    VisitorCategory.ROA: 3000,   # USD 30.00  Rest of Africa
    VisitorCategory.EAC: 25000,  # UGX 25,000 East African Citizen
}


@dataclass(frozen=True)
class EntryFeeQuote:
    unit_amount_minor: int
    amount_minor: int
    currency: str


def quote_entry_fee(category: VisitorCategory, party_size: int) -> EntryFeeQuote:
    """Total entry fee for a party of ``party_size`` in the given category."""
    if party_size < 1:
        raise ValueError("party_size must be at least 1")

    unit = ENTRY_FEE_MINOR[category]
    currency = CATEGORY_CURRENCY[category]
    return EntryFeeQuote(
        unit_amount_minor=unit,
        amount_minor=unit * party_size,
        currency=currency,
    )
