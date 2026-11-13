"""Visitor tour tracking (VMIS tracking feature).

The phone links to one ticket at the gate and opens a ``VisitSession``. A ticket
is either a walk-in entry record (``Visit``) or a paid online booking
(``Booking``). This module owns the rules that both the visitor endpoints and
staff views depend on:

- resolving what was scanned or typed to a ticket (a typed short ``VM-`` code
  also needs the visitor's passport / ID number, because 8 hex digits can be
  guessed);
- one open session per ticket;
- closing a session when the ticket ends: exit recorded, or validity expired;
- applying the phone's queued operations (consent, location points, nearby
  alerts) through the existing sync engine, limited to the token's own ticket.

Location is personal data: nothing here logs coordinates.
"""

import math
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field
from sqlalchemy import String, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.base import ensure_utc, utcnow
from app.models.booking_request import Booking
from app.models.enums import BookingStatus, PaymentStatus
from app.models.tracking import LocationPoint, PoiAlert, PointOfInterest, VisitSession
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.qr import InvalidQrPayload, parse_qr_payload
from app.tickets import compute_validity

TICKET_VISIT = "visit"
TICKET_BOOKING = "booking"

END_EXIT = "exit"
END_EXPIRED = "expired"
END_CANCELLED = "cancelled"

_SHORT_CODE = re.compile(r"^VM-?([0-9A-F]{8})$", re.IGNORECASE)
_BOOKING_CODE = re.compile(r"^MF-[A-Z0-9]+$", re.IGNORECASE)
# Before a booking is checked in its validity window has not started; a token
# minted then lasts until this long after the booking's last night.
_UNCHECKED_GRACE = timedelta(days=2)


class LinkError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Ticket:
    kind: str
    id: uuid.UUID
    visitor_id: uuid.UUID | None
    holder_name: str
    category: str | None
    gate: str | None
    ticket_code: str | None
    entered_at: datetime | None
    nights: int
    # Validity end once the clock has started (entry / check-in), else None.
    expires_at: datetime | None
    ended_at: datetime | None
    end_reason: str | None

    @property
    def token_expires_at(self) -> datetime:
        if self.expires_at is not None:
            return self.expires_at
        return utcnow() + timedelta(hours=24 * self.nights) + _UNCHECKED_GRACE


# --- tickets -----------------------------------------------------------------


def _ticket_from_visit(db: Session, visit: Visit, now: datetime) -> Ticket:
    visitor = db.get(Visitor, visit.visitor_id)
    validity = compute_validity(visit.entry_timestamp, visit.nights_purchased, now)
    ended_at = end_reason = None
    if visit.exit_timestamp is not None:
        ended_at, end_reason = ensure_utc(visit.exit_timestamp), END_EXIT
    elif validity.status.value == "Expired":
        ended_at, end_reason = validity.expiry, END_EXPIRED
    return Ticket(
        kind=TICKET_VISIT,
        id=visit.id,
        visitor_id=visit.visitor_id,
        holder_name=visitor.full_name if visitor else "Visitor",
        category=visitor.category.value if visitor else None,
        gate=visit.entry_gate,
        ticket_code=visit.ticket_number,
        entered_at=ensure_utc(visit.entry_timestamp),
        nights=visit.nights_purchased,
        expires_at=validity.expiry,
        ended_at=ended_at,
        end_reason=end_reason,
    )


def _ticket_from_booking(booking: Booking, now: datetime) -> Ticket:
    ended_at = end_reason = expires_at = None
    nights = booking.length_of_stay_nights
    if booking.arrived_at is not None:
        validity = compute_validity(booking.arrived_at, nights, now)
        expires_at = validity.expiry
        if booking.departed_at is None and validity.status.value == "Expired":
            ended_at, end_reason = validity.expiry, END_EXPIRED
    else:
        last_day = datetime.combine(booking.intended_date, datetime.min.time(), tzinfo=timezone.utc)
        if now >= last_day + timedelta(days=nights) + _UNCHECKED_GRACE:
            ended_at, end_reason = last_day + timedelta(days=nights) + _UNCHECKED_GRACE, END_EXPIRED
    if booking.departed_at is not None:
        ended_at, end_reason = ensure_utc(booking.departed_at), END_EXIT
    if booking.status == BookingStatus.CANCELLED:
        ended_at, end_reason = ended_at or now, END_CANCELLED
    return Ticket(
        kind=TICKET_BOOKING,
        id=booking.id,
        visitor_id=booking.visitor_id,
        holder_name=booking.full_name,
        category=booking.category.value if booking.category else None,
        gate=booking.entry_gate or booking.expected_gate,
        ticket_code=booking.ticket_code,
        entered_at=ensure_utc(booking.arrived_at),
        nights=nights,
        expires_at=expires_at,
        ended_at=ended_at,
        end_reason=end_reason,
    )


def load_ticket(db: Session, kind: str, ticket_id, now: datetime | None = None) -> Ticket | None:
    now = now or utcnow()
    ticket_id = uuid.UUID(str(ticket_id))
    if kind == TICKET_VISIT:
        visit = db.get(Visit, ticket_id)
        return _ticket_from_visit(db, visit, now) if visit else None
    if kind == TICKET_BOOKING:
        booking = db.get(Booking, ticket_id)
        return _ticket_from_booking(booking, now) if booking else None
    return None


def _open_visit_for(db: Session, visitor: Visitor) -> Visit:
    visit = db.scalar(
        select(Visit)
        .where(Visit.visitor_id == visitor.id, Visit.exit_timestamp.is_(None))
        .order_by(Visit.entry_timestamp.desc())
        .limit(1)
    )
    if visit is None:
        raise LinkError(409, "No entry recorded for this visitor yet. Ask the gate officer to record your entry.")
    return visit


def resolve_ticket(db: Session, identifier: str, id_number: str | None = None) -> Ticket:
    """Resolve what a visitor scanned or typed to their ticket.

    - visitor QR (``VMIS:1:<uuid>`` or a bare id): the visitor's open entry
    - booking ticket code (``MF-...``): that paid booking
    - short visitor code (``VM-1A2B3C4D``): only with the matching ID number
    """
    raw = (identifier or "").strip()
    now = utcnow()
    if not raw:
        raise LinkError(422, "Enter or scan your ticket or visitor code")

    if _BOOKING_CODE.match(raw):
        booking = db.scalar(select(Booking).where(Booking.ticket_code == raw.upper()))
        if booking is None:
            raise LinkError(404, "Ticket not found")
        if booking.payment_status != PaymentStatus.PAID:
            raise LinkError(409, "This booking has not been paid")
        return _ticket_from_booking(booking, now)

    visitor = None
    try:
        visitor = db.get(Visitor, parse_qr_payload(raw))
    except InvalidQrPayload:
        try:
            visitor = db.get(Visitor, uuid.UUID(raw))
        except ValueError:
            match = _SHORT_CODE.match(raw)
            if match is None:
                raise LinkError(404, "Ticket not found")
            if not id_number or not id_number.strip():
                raise LinkError(422, "Enter your passport or ID number with the visitor code")
            prefix = match.group(1).lower()
            candidates = db.scalars(
                select(Visitor).where(func.lower(cast(Visitor.id, String)).like(f"{prefix}%"))
            ).all()
            visitor = next(
                (v for v in candidates if v.id_number.strip().lower() == id_number.strip().lower()),
                None,
            )
            if visitor is None:
                raise LinkError(403, "The visitor code and ID number do not match")
    if visitor is None:
        raise LinkError(404, "Ticket not found")
    return _ticket_from_visit(db, _open_visit_for(db, visitor), now)


# --- sessions ----------------------------------------------------------------


def refresh_session(db: Session, session: VisitSession, now: datetime | None = None) -> VisitSession:
    """Close an open session whose ticket has ended (exit or expiry)."""
    if session.ended_at is not None:
        return session
    ticket = load_ticket(db, session.ticket_kind, session.ticket_id, now)
    if ticket is None or ticket.ended_at is not None:
        session.ended_at = ticket.ended_at if ticket else (now or utcnow())
        session.end_reason = ticket.end_reason if ticket else END_CANCELLED
        db.flush()
    return session


def open_session_for(db: Session, ticket: Ticket) -> VisitSession | None:
    session = db.scalar(
        select(VisitSession).where(
            VisitSession.ticket_kind == ticket.kind,
            VisitSession.ticket_id == ticket.id,
            VisitSession.ended_at.is_(None),
        )
    )
    if session is not None:
        refresh_session(db, session)
        if session.ended_at is not None:
            return None
    return session


def start_or_join_session(
    db: Session,
    ticket: Ticket,
    *,
    session_id: uuid.UUID | None = None,
    gate: str | None = None,
    started_at: datetime | None = None,
    consent_given: bool | None = None,
    consent_at: datetime | None = None,
) -> VisitSession:
    """Return the ticket's open session, creating it if needed (one per ticket).

    A phone that linked offline sends the id and start time it used locally so
    its queued points keep pointing at the same session.
    """
    if ticket.ended_at is not None:
        raise LinkError(409, "This ticket has ended (exit recorded or expired). Tracking is closed.")
    now = utcnow()
    session = open_session_for(db, ticket)
    if session is None:
        if session_id is not None and db.get(VisitSession, session_id) is not None:
            session_id = None
        start = min(ensure_utc(started_at), now) if started_at else now
        session = VisitSession(
            id=session_id or uuid.uuid4(),
            ticket_kind=ticket.kind,
            ticket_id=ticket.id,
            visitor_id=ticket.visitor_id,
            gate=gate or ticket.gate,
            started_at=start,
            consent_given=bool(consent_given),
            consent_at=ensure_utc(consent_at) if consent_given else None,
        )
        db.add(session)
        try:
            db.flush()
        except IntegrityError:
            # Another phone for the same ticket won the race: join its session.
            db.rollback()
            session = open_session_for(db, ticket)
            if session is None:
                raise
    elif consent_given is not None and session.consent_at is None:
        session.consent_given = bool(consent_given)
        session.consent_at = ensure_utc(consent_at) or now
        db.flush()
    return session


def close_sessions_for_ticket(db: Session, kind: str, ticket_id, ended_at: datetime, reason: str) -> int:
    sessions = db.scalars(
        select(VisitSession).where(
            VisitSession.ticket_kind == kind,
            VisitSession.ticket_id == uuid.UUID(str(ticket_id)),
            VisitSession.ended_at.is_(None),
        )
    ).all()
    for session in sessions:
        session.ended_at = ensure_utc(ended_at)
        session.end_reason = reason
    if sessions:
        db.flush()
    return len(sessions)


def close_sessions_for_visitor_exit(db: Session, visitor_id, ended_at: datetime) -> int:
    """An exit scan closes the visitor's open walk-in sessions."""
    visits = db.scalars(
        select(VisitSession.ticket_id).where(
            VisitSession.visitor_id == uuid.UUID(str(visitor_id)),
            VisitSession.ticket_kind == TICKET_VISIT,
            VisitSession.ended_at.is_(None),
        )
    ).all()
    return sum(close_sessions_for_ticket(db, TICKET_VISIT, v, ended_at, END_EXIT) for v in visits)


# --- the phone's queued operations (reusing the sync engine) -----------------


class TourContext:
    """Who is uploading: the ticket the visitor token was issued for."""

    def __init__(self, ticket_kind: str, ticket_id: uuid.UUID):
        self.ticket_kind = ticket_kind
        self.ticket_id = ticket_id
        self.id = None  # audit actor: a visitor, not a staff account


class _ConsentPayload(BaseModel):
    given: bool
    at: datetime


class _PointPayload(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    recorded_at: datetime


class _PoiAlertPayload(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    poi_id: uuid.UUID
    shown_at: datetime


def _own_session(db: Session, ctx: TourContext, session_id) -> VisitSession | None:
    session = db.get(VisitSession, session_id) if session_id else None
    if session is None or session.ticket_kind != ctx.ticket_kind or session.ticket_id != ctx.ticket_id:
        return None
    return session


def apply_session_consent(db, op, station_id, ctx: TourContext, outcome):
    data = _ConsentPayload.model_validate(op.payload)
    session = _own_session(db, ctx, op.entity_id)
    if session is None:
        return outcome("conflict", op.entity_id, "forbidden_session")
    at = ensure_utc(data.at)
    if session.consent_at is not None and at < ensure_utc(session.consent_at):
        return outcome("exists", session.id)
    session.consent_given = data.given
    session.consent_at = at
    db.flush()
    return outcome("applied", session.id)


def apply_location_point(db, op, station_id, ctx: TourContext, outcome):
    data = _PointPayload.model_validate(op.payload)
    if db.get(LocationPoint, data.id) is not None:
        return outcome("exists", data.id)
    session = _own_session(db, ctx, data.session_id)
    if session is None:
        return outcome("conflict", data.id, "forbidden_session")
    refresh_session(db, session)
    recorded = ensure_utc(data.recorded_at)
    if not session.consent_given or (session.consent_at and recorded < ensure_utc(session.consent_at)):
        return outcome("conflict", data.id, "no_consent")
    if session.ended_at is not None and recorded > ensure_utc(session.ended_at):
        return outcome("conflict", data.id, "session_closed")

    db.add(
        LocationPoint(
            id=data.id,
            session_id=session.id,
            latitude=data.latitude,
            longitude=data.longitude,
            accuracy=data.accuracy,
            recorded_at=recorded,
            received_at=utcnow(),
        )
    )
    if session.last_point_at is None or recorded >= ensure_utc(session.last_point_at):
        session.last_point_at = recorded
        session.last_latitude = data.latitude
        session.last_longitude = data.longitude
        session.last_accuracy = data.accuracy
    db.flush()
    return outcome("applied", data.id)


def apply_poi_alert(db, op, station_id, ctx: TourContext, outcome):
    data = _PoiAlertPayload.model_validate(op.payload)
    if db.get(PoiAlert, data.id) is not None:
        return outcome("exists", data.id)
    session = _own_session(db, ctx, data.session_id)
    if session is None:
        return outcome("conflict", data.id, "forbidden_session")
    if db.get(PointOfInterest, data.poi_id) is None:
        return outcome("conflict", data.id, "missing_poi")
    db.add(PoiAlert(id=data.id, session_id=session.id, poi_id=data.poi_id, shown_at=ensure_utc(data.shown_at)))
    db.flush()
    return outcome("applied", data.id)


# --- distance ----------------------------------------------------------------


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def stale_cutoff(now: datetime | None = None) -> datetime:
    return (now or utcnow()) - timedelta(minutes=get_settings().tracking_stale_minutes)


def latest_session_for(db: Session, ticket: Ticket) -> VisitSession | None:
    return db.scalar(
        select(VisitSession)
        .where(VisitSession.ticket_kind == ticket.kind, VisitSession.ticket_id == ticket.id)
        .order_by(VisitSession.started_at.desc())
        .limit(1)
    )


# --- staff views ---------------------------------------------------------------


@dataclass
class LivePosition:
    session: VisitSession
    ticket: Ticket | None
    age_seconds: int | None
    stale: bool


def live_positions(
    db: Session,
    *,
    now: datetime | None = None,
    gate: str | None = None,
    category: str | None = None,
    min_age_minutes: int | None = None,
    max_age_minutes: int | None = None,
) -> list[LivePosition]:
    """Every open session with its last known location and how old it is.

    Age runs from the phone's own record time: a phone that was offline for an
    hour uploads hour-old points, and they show as an hour old.
    """
    now = now or utcnow()
    stale_after = timedelta(minutes=get_settings().tracking_stale_minutes)
    out = []
    for session in db.scalars(select(VisitSession).where(VisitSession.ended_at.is_(None))).all():
        refresh_session(db, session, now)
        if session.ended_at is not None:
            continue
        ticket = load_ticket(db, session.ticket_kind, session.ticket_id, now)
        if gate and (session.gate or (ticket.gate if ticket else None)) != gate:
            continue
        if category and (ticket.category if ticket else None) != category:
            continue
        reference = ensure_utc(session.last_point_at) or ensure_utc(session.started_at)
        age = int((now - reference).total_seconds())
        if min_age_minutes is not None and age < min_age_minutes * 60:
            continue
        if max_age_minutes is not None and age > max_age_minutes * 60:
            continue
        stale = session.consent_given and (now - reference) > stale_after
        out.append(
            LivePosition(
                session=session,
                ticket=ticket,
                age_seconds=age if session.last_point_at is not None else None,
                stale=stale,
            )
        )
    out.sort(key=lambda p: (p.age_seconds is None, p.age_seconds or 0))
    return out


def poi_busy_counts(db: Session, now: datetime | None = None) -> list[tuple[PointOfInterest, int]]:
    """How many open sessions' last known positions lie within each active
    point's radius, for seeing which areas are busy."""
    positions = [p for p in live_positions(db, now=now) if p.session.last_latitude is not None]
    pois = db.scalars(select(PointOfInterest).where(PointOfInterest.is_active.is_(True))).all()
    counts = []
    for poi in pois:
        near = sum(
            1
            for p in positions
            if haversine_m(p.session.last_latitude, p.session.last_longitude, poi.latitude, poi.longitude)
            <= poi.radius_m
        )
        counts.append((poi, near))
    counts.sort(key=lambda c: -c[1])
    return counts
