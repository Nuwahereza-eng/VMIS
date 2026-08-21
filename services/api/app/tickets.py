"""Ticket validity engine (build prompt Table 4).

    expiry = entry_timestamp + (nights_purchased x 24 hours)
    status = "Active" if now < expiry else "Expired"

Both the status and the remaining time are derived on every call and never
persisted, so a station with a wrong local clock cannot corrupt a stored expiry.
All arithmetic is done in timezone-aware UTC.
"""

import enum
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models.base import ensure_utc, utcnow


class TicketStatus(str, enum.Enum):
    ACTIVE = "Active"
    EXPIRED = "Expired"


@dataclass(frozen=True)
class TicketValidity:
    expiry: datetime
    status: TicketStatus
    remaining_seconds: int  # 0 once expired, never negative


def compute_expiry(entry_timestamp: datetime, nights_purchased: int) -> datetime:
    return ensure_utc(entry_timestamp) + timedelta(hours=24 * nights_purchased)


def compute_validity(
    entry_timestamp: datetime,
    nights_purchased: int,
    now: datetime | None = None,
) -> TicketValidity:
    reference = ensure_utc(now) if now is not None else utcnow()
    expiry = compute_expiry(entry_timestamp, nights_purchased)
    if reference < expiry:
        remaining = int((expiry - reference).total_seconds())
        return TicketValidity(expiry=expiry, status=TicketStatus.ACTIVE, remaining_seconds=remaining)
    return TicketValidity(expiry=expiry, status=TicketStatus.EXPIRED, remaining_seconds=0)
