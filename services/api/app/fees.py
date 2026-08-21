"""Fee computation (build prompt section 4.1: "Fee computed automatically").

The fee for an activity is the per-category rate multiplied by quantity. All
arithmetic is on integer minor units; no float ever touches money. Free
activities resolve to zero in the category's currency. The currency must match
the visitor's category (build prompt Table 1), which the seed data guarantees.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity import Activity, ActivityRate
from app.models.enums import CATEGORY_CURRENCY, VisitorCategory


class RateNotFound(Exception):
    """No rate exists for this activity and category, and it is not free."""


@dataclass(frozen=True)
class FeeQuote:
    unit_amount_minor: int
    amount_minor: int
    currency: str


def quote_activity_fee(
    db: Session,
    activity: Activity,
    category: VisitorCategory,
    quantity: int,
) -> FeeQuote:
    if quantity < 1:
        raise ValueError("quantity must be at least 1")

    currency = CATEGORY_CURRENCY[category]

    if activity.is_free:
        return FeeQuote(unit_amount_minor=0, amount_minor=0, currency=currency)

    rate = db.scalar(
        select(ActivityRate).where(
            ActivityRate.activity_id == activity.id,
            ActivityRate.category == category,
        )
    )
    if rate is None:
        raise RateNotFound(
            f"No rate for activity '{activity.code}' and category '{category.value}'"
        )

    # Guard the invariant even though seed data enforces it.
    if rate.currency != currency:
        raise ValueError(
            f"Rate currency {rate.currency} does not match category currency {currency}"
        )

    return FeeQuote(
        unit_amount_minor=rate.amount_minor,
        amount_minor=rate.amount_minor * quantity,
        currency=currency,
    )
