"""Pre-booking / expression-of-interest capture (supervisor priority 2).

Officers capture a booking before a visitor arrives; management sees who is
expected on any given day and can filter by date or status. A booking is
matched to a registered visitor on arrival (``status`` -> ``arrived``), which
also feeds the walk-in vs pre-booked distinction in reporting. Captured
online-first; status is stored (a booking is a plan, not a derived value).
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.base import utcnow
from app.models.booking_request import Booking
from app.models.enums import BookingStatus, Role
from app.models.user import User
from app.models.visitor import Visitor
from app.rbac import get_current_user, require_roles
from app.schemas import BookingCreate, BookingOut, BookingUpdate, ExpectedDay

router = APIRouter(prefix="/bookings", tags=["bookings"])

# Any officer can capture/read bookings; management manages them. Tourists may
# also create a booking for themselves (self-service), but only see and cancel
# their own — never the park-wide list.
_capture_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)
_create_roles = require_roles(
    Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT, Role.TOURIST
)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_create_roles),
) -> BookingOut:
    booking = Booking(
        id=uuid.uuid4(),
        full_name=payload.full_name,
        intended_date=payload.intended_date,
        country=payload.country,
        phone=payload.phone,
        email=payload.email,
        tour_company=payload.tour_company,
        category=payload.category,
        party_size=payload.party_size,
        expected_gate=payload.expected_gate,
        length_of_stay_nights=payload.length_of_stay_nights,
        accommodation=payload.accommodation,
        notes=payload.notes,
        status=BookingStatus.PENDING,
        created_by_id=actor.id,
        origin_station_id=actor.station_id,
    )
    db.add(booking)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="booking",
        entity_id=str(booking.id),
        actor_user_id=actor.id,
        details={"intended_date": str(booking.intended_date), "party_size": booking.party_size},
    )
    return BookingOut.model_validate(booking)


@router.get("/mine", response_model=list[BookingOut])
def list_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[BookingOut]:
    """A tourist's own bookings (anything they created), newest intended date
    first. Scoped to the caller, so it never exposes other visitors' plans."""
    stmt = (
        select(Booking)
        .where(Booking.created_by_id == current_user.id)
        .order_by(Booking.intended_date.desc(), Booking.created_at.desc())
    )
    bookings = db.scalars(stmt).all()
    return [BookingOut.model_validate(b) for b in bookings]


@router.get("", response_model=list[BookingOut])
def list_bookings(
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
    booking_status: BookingStatus | None = Query(default=None),
    on_date: date | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[BookingOut]:
    stmt = select(Booking)
    if booking_status is not None:
        stmt = stmt.where(Booking.status == booking_status)
    if on_date is not None:
        stmt = stmt.where(Booking.intended_date == on_date)
    if date_from is not None:
        stmt = stmt.where(Booking.intended_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Booking.intended_date <= date_to)
    stmt = stmt.order_by(Booking.intended_date, Booking.created_at)
    bookings = db.scalars(stmt).all()
    return [BookingOut.model_validate(b) for b in bookings]


@router.get("/expected-summary", response_model=list[ExpectedDay])
def expected_summary(
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
) -> list[ExpectedDay]:
    """Expected (not-yet-arrived) visitors per day, for the management view."""
    stmt = (
        select(
            Booking.intended_date,
            func.count().label("bookings"),
            func.coalesce(func.sum(Booking.party_size), 0).label("expected_visitors"),
        )
        .where(Booking.status == BookingStatus.PENDING)
        .group_by(Booking.intended_date)
        .order_by(Booking.intended_date)
    )
    if date_from is not None:
        stmt = stmt.where(Booking.intended_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Booking.intended_date <= date_to)
    rows = db.execute(stmt).all()
    return [
        ExpectedDay(intended_date=r.intended_date, bookings=r.bookings, expected_visitors=r.expected_visitors)
        for r in rows
    ]


@router.get("/{booking_id}", response_model=BookingOut)
def get_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> BookingOut:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return BookingOut.model_validate(booking)


@router.patch("/{booking_id}", response_model=BookingOut)
def update_booking(
    booking_id: uuid.UUID,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    officer: User = Depends(_capture_roles),
) -> BookingOut:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    data = payload.model_dump(exclude_unset=True)

    # Linking to a visitor must reference a real visitor and marks arrival.
    if "visitor_id" in data and data["visitor_id"] is not None:
        if db.get(Visitor, data["visitor_id"]) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")
        if booking.arrived_at is None:
            booking.arrived_at = utcnow()
        data.setdefault("status", BookingStatus.ARRIVED)

    for field, value in data.items():
        setattr(booking, field, value)

    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="booking",
        entity_id=str(booking.id),
        actor_user_id=officer.id,
        details={"status": booking.status.value},
    )
    return BookingOut.model_validate(booking)


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BookingOut:
    """Cancel a pending booking. A tourist may cancel only their own booking;
    officers and management may cancel any. Already-arrived bookings can't be
    cancelled (the visitor is on-site)."""
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if current_user.role == Role.TOURIST and booking.created_by_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own bookings",
        )
    if booking.status == BookingStatus.ARRIVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An arrived booking can no longer be cancelled",
        )

    booking.status = BookingStatus.CANCELLED
    db.flush()
    record_audit(
        db,
        action="cancel",
        entity_type="booking",
        entity_id=str(booking.id),
        actor_user_id=current_user.id,
    )
    return BookingOut.model_validate(booking)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking(
    booking_id: uuid.UUID,
    db: Session = Depends(get_db),
    officer: User = Depends(require_roles(Role.MANAGEMENT)),
) -> Response:
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    db.delete(booking)
    record_audit(
        db,
        action="delete",
        entity_type="booking",
        entity_id=str(booking_id),
        actor_user_id=officer.id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
