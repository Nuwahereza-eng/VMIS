"""Visit reminders and upcoming-visit monitoring (supervisor priority 5).

Bookings carry an intended visit date. The supervisor asked for reminders to go
out roughly one week and one day before arrival, and for management to monitor
upcoming visits. There is no email/SMS provider wired up yet, so reminders are
surfaced in-app: this module derives, on request, which pending bookings are
due for a one-week or one-day reminder, which are further out, and which have
slipped past their date while still pending (no-show candidates).

Everything is derived from pending bookings; nothing is stored. A booking that
has already been matched to a visitor (``arrived``) or cancelled drops out of
the reminder list automatically.
"""

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.booking_request import Booking
from app.models.enums import BookingStatus

WEEK_BEFORE_DAYS = 7
DAY_BEFORE_DAYS = 1

# Reminder kinds, most to least urgent.
OVERDUE = "overdue"
DUE_TODAY = "due_today"
DAY_BEFORE = "day_before"
WEEK_BEFORE = "week_before"
SCHEDULED = "scheduled"

KIND_LABEL = {
    OVERDUE: "Overdue",
    DUE_TODAY: "Arriving today",
    DAY_BEFORE: "One day before",
    WEEK_BEFORE: "One week before",
    SCHEDULED: "Scheduled",
}


@dataclass
class ReminderItem:
    booking_id: str
    full_name: str
    intended_date: date
    days_until: int
    kind: str
    label: str
    party_size: int
    expected_gate: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    # True when the booking has contact details to reach the visitor on.
    contactable: bool = False


@dataclass
class Reminders:
    reference_date: date
    due_now: list[ReminderItem] = field(default_factory=list)
    upcoming: list[ReminderItem] = field(default_factory=list)
    overdue: list[ReminderItem] = field(default_factory=list)
    week_before_count: int = 0
    day_before_count: int = 0


def classify(days_until: int) -> str:
    if days_until < 0:
        return OVERDUE
    if days_until == 0:
        return DUE_TODAY
    if days_until <= DAY_BEFORE_DAYS:
        return DAY_BEFORE
    if days_until <= WEEK_BEFORE_DAYS:
        return WEEK_BEFORE
    return SCHEDULED


def build_reminders(db: Session, reference: date | None = None) -> Reminders:
    today = reference or date.today()

    bookings = db.scalars(
        select(Booking)
        .where(Booking.status == BookingStatus.PENDING)
        .order_by(Booking.intended_date)
    ).all()

    result = Reminders(reference_date=today)
    for booking in bookings:
        days_until = (booking.intended_date - today).days
        kind = classify(days_until)
        item = ReminderItem(
            booking_id=str(booking.id),
            full_name=booking.full_name,
            intended_date=booking.intended_date,
            days_until=days_until,
            kind=kind,
            label=KIND_LABEL[kind],
            party_size=booking.party_size,
            expected_gate=booking.expected_gate,
            country=booking.country,
            phone=booking.phone,
            email=booking.email,
            contactable=bool(booking.phone or booking.email),
        )
        if kind == OVERDUE:
            result.overdue.append(item)
        elif kind == SCHEDULED:
            result.upcoming.append(item)
        else:
            result.due_now.append(item)
            if kind == WEEK_BEFORE:
                result.week_before_count += 1
            elif kind in (DAY_BEFORE, DUE_TODAY):
                result.day_before_count += 1

    return result
