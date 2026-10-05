"""Derive a visitor's current lifecycle status (supervisor priority 3).

Status is never stored. It is recomputed from the visitor's most recent visit,
that visit's ticket validity, and the visitor's scan trail:

    - No ticket / not yet arrived  -> NO_TICKET
    - Latest scan is an EXIT, or the visit is closed -> EXITED
    - Ticket has expired            -> EXPIRED
    - Latest scan is a CHECKPOINT   -> AT_CHECKPOINT
    - Otherwise (entrance scan / open valid ticket) -> INSIDE

``BOOKED`` / ``EXPECTED`` / ``ARRIVED`` are reserved for the pre-booking module
and are not produced here yet.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.base import ensure_utc
from app.models.enums import ScanKind, VisitorStatus
from app.models.scan import ScanEvent
from app.models.visit import Visit
from app.origin import PRE_BOOKED, WALK_IN, is_prebooked
from app.schemas import ScanOut, TicketInfo, VisitorStatusOut
from app.tickets import compute_validity


def _scan_out(scan: ScanEvent) -> ScanOut:
    return ScanOut(
        id=scan.id,
        visitor_id=scan.visitor_id,
        visit_id=scan.visit_id,
        kind=scan.kind,
        location=scan.location,
        scanned_at=ensure_utc(scan.scanned_at),
        officer_id=scan.officer_id,
        origin_station_id=scan.origin_station_id,
    )


def latest_open_visit(db: Session, visitor_id) -> Visit | None:
    """Most recent open (no exit) visit for the visitor, if any."""
    return db.scalar(
        select(Visit)
        .where(Visit.visitor_id == visitor_id, Visit.exit_timestamp.is_(None))
        .order_by(Visit.entry_timestamp.desc())
        .limit(1)
    )


def latest_visit(db: Session, visitor_id) -> Visit | None:
    return db.scalar(
        select(Visit)
        .where(Visit.visitor_id == visitor_id)
        .order_by(Visit.entry_timestamp.desc())
        .limit(1)
    )


def compute_status(db: Session, visitor_id) -> VisitorStatusOut:
    last_scan = db.scalar(
        select(ScanEvent)
        .where(ScanEvent.visitor_id == visitor_id)
        .order_by(ScanEvent.scanned_at.desc())
        .limit(1)
    )
    scan_count = db.scalar(
        select(func.count()).select_from(ScanEvent).where(ScanEvent.visitor_id == visitor_id)
    ) or 0

    visit = latest_visit(db, visitor_id)
    ticket: TicketInfo | None = None
    if visit is not None:
        validity = compute_validity(visit.entry_timestamp, visit.nights_purchased)
        ticket = TicketInfo(
            expiry=validity.expiry,
            status=validity.status.value,
            remaining_seconds=validity.remaining_seconds,
        )

    status = _derive(visit, last_scan, ticket)

    return VisitorStatusOut(
        visitor_id=visitor_id,
        status=status,
        origin=PRE_BOOKED if is_prebooked(db, visitor_id) else WALK_IN,
        last_scan=_scan_out(last_scan) if last_scan is not None else None,
        ticket=ticket,
        scan_count=scan_count,
    )


def _derive(visit: Visit | None, last_scan: ScanEvent | None, ticket: TicketInfo | None) -> VisitorStatus:
    # No visit on record and no scans -> the visitor has not entered.
    if visit is None and last_scan is None:
        return VisitorStatus.NO_TICKET

    # An explicit exit scan, or a closed visit, means the visitor has left.
    if last_scan is not None and last_scan.kind == ScanKind.EXIT:
        return VisitorStatus.EXITED
    if visit is not None and visit.exit_timestamp is not None:
        return VisitorStatus.EXITED

    # Ticket expired while still inside.
    if ticket is not None and ticket.status == "Expired":
        return VisitorStatus.EXPIRED

    # Positioned at an internal checkpoint on the last scan.
    if last_scan is not None and last_scan.kind == ScanKind.CHECKPOINT:
        return VisitorStatus.AT_CHECKPOINT

    # Otherwise the visitor is inside the park (entrance scan or valid open ticket).
    if (last_scan is not None and last_scan.kind == ScanKind.ENTRANCE) or (
        visit is not None and visit.exit_timestamp is None
    ):
        return VisitorStatus.INSIDE

    return VisitorStatus.NO_TICKET
