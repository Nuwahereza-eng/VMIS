"""Derived visit lifecycle of a booking (booked -> paid -> touring -> completed).

The tourist-facing journey after payment: a paid ticket is checked in at a
gate (the tour starts), stays valid for ``nights x 24h`` from check-in (build
prompt Table 4), and ends either with a check-out on exit (completed) or by
running out (expired). Nothing here is stored; it is recomputed on every read.
"""

from dataclasses import dataclass
from datetime import datetime

from app.models.enums import BookingLifecycle, BookingStatus, PaymentStatus
from app.tickets import TicketStatus, compute_validity


@dataclass(frozen=True)
class LifecycleState:
    stage: BookingLifecycle
    ticket_expires_at: datetime | None
    ticket_remaining_seconds: int | None


def compute_lifecycle(
    status: BookingStatus,
    payment_status: PaymentStatus,
    arrived_at: datetime | None,
    departed_at: datetime | None,
    nights: int,
    now: datetime | None = None,
) -> LifecycleState:
    if status == BookingStatus.CANCELLED:
        return LifecycleState(BookingLifecycle.CANCELLED, None, None)
    if status == BookingStatus.NO_SHOW:
        return LifecycleState(BookingLifecycle.NO_SHOW, None, None)

    if arrived_at is not None:
        validity = compute_validity(arrived_at, nights, now)
        if departed_at is not None:
            return LifecycleState(BookingLifecycle.COMPLETED, validity.expiry, 0)
        stage = (
            BookingLifecycle.TOURING
            if validity.status == TicketStatus.ACTIVE
            else BookingLifecycle.EXPIRED
        )
        return LifecycleState(stage, validity.expiry, validity.remaining_seconds)

    if status == BookingStatus.ARRIVED:
        # Arrived before check-in times were recorded: on site, no known window.
        return LifecycleState(BookingLifecycle.TOURING, None, None)
    if payment_status == PaymentStatus.PAID:
        return LifecycleState(BookingLifecycle.PAID, None, None)
    return LifecycleState(BookingLifecycle.BOOKED, None, None)
