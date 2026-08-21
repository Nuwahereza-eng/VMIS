"""Entry/exit capture and ticket validity (Sprint 3).

Entry records a visitor's arrival (gate, timestamp, officer, ticket number,
nights purchased). Exit is matched against the visitor's open visit on
departure; an unmatched entry stays open. Ticket status and remaining time are
computed on every response by the ticket engine and never stored.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.base import ensure_utc, utcnow
from app.models.enums import Role
from app.models.user import User
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.rbac import require_roles
from app.schemas import EntryCreate, EntryResult, ExitCreate, TicketInfo, VisitOut
from app.tickets import compute_validity

router = APIRouter(prefix="/visits", tags=["visits"])

# Entry/exit is a gate operation; management can also act (build prompt section 6).
_gate_roles = require_roles(Role.GATE_OFFICER, Role.MANAGEMENT)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


def _to_out(visit: Visit) -> VisitOut:
    validity = compute_validity(visit.entry_timestamp, visit.nights_purchased)
    return VisitOut(
        id=visit.id,
        visitor_id=visit.visitor_id,
        entry_gate=visit.entry_gate,
        entry_timestamp=ensure_utc(visit.entry_timestamp),
        ticket_number=visit.ticket_number,
        nights_purchased=visit.nights_purchased,
        exit_gate=visit.exit_gate,
        exit_timestamp=ensure_utc(visit.exit_timestamp),
        is_open=visit.is_open,
        origin_station_id=visit.origin_station_id,
        server_received_at=ensure_utc(visit.server_received_at),
        ticket=TicketInfo(
            expiry=validity.expiry,
            status=validity.status.value,
            remaining_seconds=validity.remaining_seconds,
        ),
    )


@router.post("", response_model=EntryResult, status_code=status.HTTP_201_CREATED)
def record_entry(
    payload: EntryCreate,
    response: Response,
    db: Session = Depends(get_db),
    officer: User = Depends(_gate_roles),
) -> EntryResult:
    # Idempotent replay of an offline write must not create a second visit.
    if payload.id is not None:
        existing = db.get(Visit, payload.id)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return EntryResult(visit=_to_out(existing), idempotent=True)

    if db.get(Visitor, payload.visitor_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")

    # Non-blocking duplicate-entry warning: an existing open visit for this
    # visitor. The gate officer decides; auto-resolution is a Sprint 5 concern.
    open_exists = db.scalar(
        select(Visit.id).where(Visit.visitor_id == payload.visitor_id, Visit.exit_timestamp.is_(None))
    )

    visit = Visit(
        id=payload.id or uuid.uuid4(),
        visitor_id=payload.visitor_id,
        entry_gate=payload.entry_gate or officer.station_id or "UNKNOWN",
        entry_timestamp=payload.entry_timestamp or utcnow(),
        entry_officer_id=officer.id,
        ticket_number=payload.ticket_number,
        nights_purchased=payload.nights_purchased,
        origin_station_id=payload.origin_station_id or officer.station_id,
        client_created_at=payload.client_created_at,
    )
    db.add(visit)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="visit",
        entity_id=str(visit.id),
        actor_user_id=officer.id,
        details={"gate": visit.entry_gate, "nights": visit.nights_purchased},
    )
    return EntryResult(visit=_to_out(visit), duplicate_open_visit=open_exists is not None)


@router.post("/{visit_id}/exit", response_model=VisitOut)
def record_exit(
    visit_id: uuid.UUID,
    payload: ExitCreate,
    db: Session = Depends(get_db),
    officer: User = Depends(_gate_roles),
) -> VisitOut:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")

    if visit.exit_timestamp is not None:
        # Already closed. Idempotent: return the existing closed visit unchanged.
        return _to_out(visit)

    visit.exit_gate = payload.exit_gate or officer.station_id or "UNKNOWN"
    visit.exit_timestamp = payload.exit_timestamp or utcnow()
    visit.exit_officer_id = officer.id
    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="visit",
        entity_id=str(visit.id),
        actor_user_id=officer.id,
        details={"exit_gate": visit.exit_gate},
    )
    return _to_out(visit)


@router.get("/open", response_model=list[VisitOut])
def list_open_visits(
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[VisitOut]:
    """Open (unmatched) stays: visitors currently inside the park."""
    visits = db.scalars(
        select(Visit).where(Visit.exit_timestamp.is_(None)).order_by(Visit.entry_timestamp)
    ).all()
    return [_to_out(v) for v in visits]


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(
    visit_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> VisitOut:
    visit = db.get(Visit, visit_id)
    if visit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit not found")
    return _to_out(visit)
