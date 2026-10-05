"""Walk-in vs pre-booked classification (supervisor priority 4 / section 4 & 15).

A visitor is *pre-booked* when a ``Booking`` was matched to them on arrival
(``Booking.visitor_id``); everyone else who entered is a *walk-in*. The
distinction is derived on request from the bookings table — never stored on the
visitor — so it stays correct if a booking is linked or removed later.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.booking_request import Booking

PRE_BOOKED = "pre_booked"
WALK_IN = "walk_in"

PRE_BOOKED_LABEL = "Pre-booked"
WALK_IN_LABEL = "Walk-in"


def prebooked_visitor_ids(db: Session) -> set:
    """Set of visitor ids that have an associated (matched) booking."""
    rows = db.scalars(select(Booking.visitor_id).where(Booking.visitor_id.is_not(None))).all()
    return set(rows)


def is_prebooked(db: Session, visitor_id) -> bool:
    return (
        db.scalar(
            select(Booking.id).where(Booking.visitor_id == visitor_id).limit(1)
        )
        is not None
    )


def classify(visitor_id, prebooked: set) -> str:
    return PRE_BOOKED if visitor_id in prebooked else WALK_IN
