"""Operational alerts (build prompt section 4.1, Alerts).

Five alert kinds are derived from live data, never stored:

- ``expiry_warning``  an open stay whose ticket is still valid but within the
                      warning window (default 3h), giving advance notice before
                      it lapses rather than only at the moment of expiry.
- ``ticket_expired``  an open stay whose ticket has passed its expiry.
- ``overstay``        an open stay still inside more than a grace period past
                      expiry (a stronger form of ticket expiry).
- ``missing_exit``    an open stay whose entry is older than a threshold, i.e.
                      the exit was probably never recorded.
- ``duplicate_entry`` a visitor holding more than one open stay at once.

All arithmetic is timezone-aware UTC. Thresholds come from settings so an
operator can tune them without a code change.
"""

import enum
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.base import ensure_utc, utcnow
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.tickets import compute_validity


class AlertKind(str, enum.Enum):
    EXPIRY_WARNING = "expiry_warning"
    TICKET_EXPIRED = "ticket_expired"
    OVERSTAY = "overstay"
    MISSING_EXIT = "missing_exit"
    DUPLICATE_ENTRY = "duplicate_entry"


@dataclass(frozen=True)
class Alert:
    kind: AlertKind
    visit_id: str
    visitor_id: str
    entry_gate: str
    entry_timestamp: datetime
    detail: str
    # Visitor + ticket context so the UI can open the real problem directly.
    visitor_name: str | None = None
    visitor_category: str | None = None
    nationality: str | None = None
    ticket_number: str | None = None
    nights_purchased: int | None = None
    expiry_timestamp: datetime | None = None


def compute_alerts(db: Session, now: datetime | None = None) -> list[Alert]:
    """Return every current alert across all open stays.

    Only open stays (no recorded exit) can raise an alert: a departed visitor
    is no longer a live concern.
    """
    settings = get_settings()
    reference = ensure_utc(now) if now is not None else utcnow()
    overstay_after = timedelta(hours=settings.overstay_grace_hours)
    missing_exit_after = timedelta(hours=settings.missing_exit_hours)
    expiry_warning_within = timedelta(hours=settings.expiry_warning_hours)

    open_visits = db.scalars(
        select(Visit).where(Visit.exit_timestamp.is_(None)).order_by(Visit.entry_timestamp)
    ).all()

    # Load the matching visitors once so every alert can carry the visitor's
    # identity and category, letting the UI open the real problem directly.
    visitor_ids = {visit.visitor_id for visit in open_visits}
    visitors_by_id: dict[str, Visitor] = {}
    if visitor_ids:
        for visitor in db.scalars(select(Visitor).where(Visitor.id.in_(visitor_ids))).all():
            visitors_by_id[str(visitor.id)] = visitor

    def context(visit: Visit, visitor_key: str, expiry: datetime | None = None) -> dict:
        visitor = visitors_by_id.get(visitor_key)
        category = getattr(visitor, "category", None) if visitor else None
        return {
            "visitor_name": visitor.full_name if visitor else None,
            "visitor_category": getattr(category, "value", category),
            "nationality": (visitor.nationality if visitor else None),
            "ticket_number": visit.ticket_number,
            "nights_purchased": visit.nights_purchased,
            "expiry_timestamp": expiry,
        }

    alerts: list[Alert] = []
    open_count_by_visitor: dict[str, int] = {}

    for visit in open_visits:
        visitor_key = str(visit.visitor_id)
        open_count_by_visitor[visitor_key] = open_count_by_visitor.get(visitor_key, 0) + 1

        entry = ensure_utc(visit.entry_timestamp)
        validity = compute_validity(visit.entry_timestamp, visit.nights_purchased, reference)
        expiry = validity.expiry

        if reference >= expiry:
            overdue = reference - expiry
            if overdue >= overstay_after:
                alerts.append(
                    Alert(
                        kind=AlertKind.OVERSTAY,
                        visit_id=str(visit.id),
                        visitor_id=visitor_key,
                        entry_gate=visit.entry_gate,
                        entry_timestamp=entry,
                        detail=f"Inside {int(overdue.total_seconds() // 3600)}h past ticket expiry",
                        **context(visit, visitor_key, expiry),
                    )
                )
            else:
                alerts.append(
                    Alert(
                        kind=AlertKind.TICKET_EXPIRED,
                        visit_id=str(visit.id),
                        visitor_id=visitor_key,
                        entry_gate=visit.entry_gate,
                        entry_timestamp=entry,
                        detail="Ticket expired while still inside",
                        **context(visit, visitor_key, expiry),
                    )
                )
        else:
            # Still valid: warn once the remaining time is within the window so
            # staff and the visitor get advance notice before the ticket lapses.
            remaining = expiry - reference
            if remaining <= expiry_warning_within:
                hours_left = int(remaining.total_seconds() // 3600)
                minutes_left = int((remaining.total_seconds() % 3600) // 60)
                if hours_left > 0:
                    left = f"{hours_left}h {minutes_left}m"
                else:
                    left = f"{minutes_left}m"
                alerts.append(
                    Alert(
                        kind=AlertKind.EXPIRY_WARNING,
                        visit_id=str(visit.id),
                        visitor_id=visitor_key,
                        entry_gate=visit.entry_gate,
                        entry_timestamp=entry,
                        detail=f"Ticket expires in {left}",
                        **context(visit, visitor_key, expiry),
                    )
                )

        if reference - entry >= missing_exit_after:
            alerts.append(
                Alert(
                    kind=AlertKind.MISSING_EXIT,
                    visit_id=str(visit.id),
                    visitor_id=visitor_key,
                    entry_gate=visit.entry_gate,
                    entry_timestamp=entry,
                    detail=f"Open for {int((reference - entry).total_seconds() // 3600)}h with no exit",
                    **context(visit, visitor_key, expiry),
                )
            )

    # Duplicate entry: a visitor with more than one open stay at the same time.
    for visit in open_visits:
        visitor_key = str(visit.visitor_id)
        if open_count_by_visitor.get(visitor_key, 0) > 1:
            alerts.append(
                Alert(
                    kind=AlertKind.DUPLICATE_ENTRY,
                    visit_id=str(visit.id),
                    visitor_id=visitor_key,
                    entry_gate=visit.entry_gate,
                    entry_timestamp=ensure_utc(visit.entry_timestamp),
                    detail="Visitor has more than one open stay",
                    **context(visit, visitor_key),
                )
            )

    return alerts
