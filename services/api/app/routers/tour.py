"""Visitor tour endpoints (tracking feature, section 4.1-4.3).

Used by the visitor's own phone, which never holds a staff account: it holds a
token signed for exactly one ticket, valid until the ticket ends. Every read and
write here is scoped to that ticket.

The phone works offline after linking; these endpoints are where it catches up
(link, refresh its ticket and points of interest, upload its queue).
"""

import uuid

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tracking
from app.config import get_settings
from app.db import get_db
from app.models.tracking import PointOfInterest
from app.schemas import (
    PoiOut,
    SyncBatchResult,
    TourLinkRequest,
    TourSessionOut,
    TourSettingsOut,
    TourStateOut,
    TourSyncRequest,
    TourTicketOut,
)
from app.security import create_tour_token, decode_tour_token
from app.sync import apply_tour_batch

router = APIRouter(prefix="/tour", tags=["tour"])


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


def tour_ticket(authorization: str | None = Header(default=None)) -> tuple[str, uuid.UUID]:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Visitor link required")
    try:
        kind, ticket_id = decode_tour_token(token)
        return kind, uuid.UUID(ticket_id)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Visitor link is invalid or expired")


def _active_pois(db: Session) -> list[PoiOut]:
    rows = db.scalars(select(PointOfInterest).where(PointOfInterest.is_active.is_(True))).all()
    return [PoiOut.model_validate(p) for p in rows]


def _state(db: Session, ticket: tracking.Ticket, session) -> TourStateOut:
    settings = get_settings()
    return TourStateOut(
        token=create_tour_token(ticket.kind, str(ticket.id), ticket.token_expires_at),
        token_expires_at=ticket.token_expires_at,
        session=TourSessionOut.model_validate(session),
        ticket=TourTicketOut(
            kind=ticket.kind,
            holder_name=ticket.holder_name,
            category=ticket.category,
            gate=ticket.gate,
            ticket_code=ticket.ticket_code,
            entered_at=ticket.entered_at,
            nights=ticket.nights,
            expires_at=ticket.expires_at,
            ended_at=ticket.ended_at,
            end_reason=ticket.end_reason,
        ),
        points_of_interest=_active_pois(db),
        settings=TourSettingsOut(
            min_distance_m=settings.tracking_min_distance_m,
            min_interval_s=settings.tracking_min_interval_s,
            poi_repeat_minutes=settings.poi_repeat_minutes,
        ),
    )


@router.post("/link", response_model=TourStateOut)
def link(
    payload: TourLinkRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> TourStateOut:
    """Link this phone to a ticket and start (or rejoin) the ticket's session."""
    try:
        if _bearer(authorization):
            kind, ticket_id = tour_ticket(authorization)
            ticket = tracking.load_ticket(db, kind, ticket_id)
            if ticket is None:
                raise tracking.LinkError(404, "Ticket not found")
        else:
            ticket = tracking.resolve_ticket(db, payload.identifier or "", payload.id_number)
        session = tracking.start_or_join_session(
            db,
            ticket,
            session_id=payload.session_id,
            gate=payload.gate,
            started_at=payload.started_at,
            consent_given=payload.consent_given,
            consent_at=payload.consent_at,
        )
    except tracking.LinkError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    db.commit()
    return _state(db, ticket, session)


@router.get("/session", response_model=TourStateOut)
def current_session(
    ticket_ref: tuple[str, uuid.UUID] = Depends(tour_ticket),
    db: Session = Depends(get_db),
) -> TourStateOut:
    """The phone's catch-up: ticket status (closed at exit or expiry), a fresh
    token, and the current points of interest."""
    kind, ticket_id = ticket_ref
    ticket = tracking.load_ticket(db, kind, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    session = tracking.open_session_for(db, ticket) or tracking.latest_session_for(db, ticket)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No visit session for this ticket")
    db.commit()
    return _state(db, ticket, session)


@router.post("/sync", response_model=SyncBatchResult)
def sync(
    payload: TourSyncRequest,
    ticket_ref: tuple[str, uuid.UUID] = Depends(tour_ticket),
    db: Session = Depends(get_db),
) -> SyncBatchResult:
    """Upload the phone's queued consent changes, location points and nearby
    alerts. Same engine and op-id log as station sync: a repeated upload is
    reported as duplicates and stores nothing twice."""
    kind, ticket_id = ticket_ref
    return apply_tour_batch(db, payload.operations, tracking.TourContext(kind, ticket_id))
