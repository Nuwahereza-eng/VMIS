"""Staff side of visitor tour tracking (tracking feature, section 4.3-4.4).

- Gate staff mint a per-visitor tour link (the QR a visitor's phone opens).
- Management manages points of interest.
- Visitor locations (live view, paths, busy areas) need the
  ``view_visitor_locations`` permission, checked here on the server.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tracking
from app.audit import record_audit
from app.db import get_db
from app.models.activity import Activity
from app.models.booking_request import Booking
from app.models.enums import Role
from app.models.tracking import LocationPoint, PointOfInterest, VisitSession
from app.models.user import User
from app.models.visitor import Visitor
from app.rbac import Permission, require_permission, require_roles
from app.schemas import (
    LivePositionOut,
    PathPointOut,
    PoiBusyOut,
    PoiCreate,
    PoiOut,
    PoiUpdate,
    SessionPathOut,
    TourTokenOut,
    TourTokenRequest,
)
from app.security import create_tour_token

router = APIRouter(prefix="/tracking", tags=["tracking"])

_gate_roles = require_roles(Role.GATE_OFFICER, Role.MANAGEMENT)
_link_roles = require_roles(Role.GATE_OFFICER, Role.MANAGEMENT, Role.TOURIST)
_manage_roles = require_roles(Role.MANAGEMENT)
_view_locations = require_permission(Permission.VIEW_VISITOR_LOCATIONS)


@router.post("/tour-token", response_model=TourTokenOut)
def mint_tour_token(
    payload: TourTokenRequest,
    db: Session = Depends(get_db),
    officer: User = Depends(_link_roles),
) -> TourTokenOut:
    """A signed link for one visitor's ticket, shown as a QR after registration
    or entry so the visitor's phone links without typing anything. A tourist
    with an account may create one for their own paid booking only."""
    try:
        if officer.role == Role.TOURIST and payload.booking_id is None:
            raise tracking.LinkError(403, "Tourists can only create a tour link for their own booking")
        if payload.booking_id is not None:
            booking = db.get(Booking, payload.booking_id)
            if booking is None or not booking.ticket_code:
                raise tracking.LinkError(404, "Paid booking not found")
            if officer.role == Role.TOURIST and booking.created_by_id != officer.id:
                raise tracking.LinkError(403, "You can only create a tour link for your own booking")
            ticket = tracking.resolve_ticket(db, booking.ticket_code)
        elif payload.visitor_id is not None:
            visitor = db.get(Visitor, payload.visitor_id)
            if visitor is None:
                raise tracking.LinkError(404, "Visitor not found")
            ticket = tracking.resolve_ticket(db, str(visitor.id))
        else:
            raise tracking.LinkError(422, "Give a visitor or a booking")
    except tracking.LinkError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail)
    if ticket.ended_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This ticket has already ended")
    return TourTokenOut(
        token=create_tour_token(ticket.kind, str(ticket.id), ticket.token_expires_at),
        expires_at=ticket.token_expires_at,
    )


def _position_out(p: tracking.LivePosition) -> LivePositionOut:
    s, t = p.session, p.ticket
    return LivePositionOut(
        session_id=s.id,
        ticket_kind=s.ticket_kind,
        visitor_id=s.visitor_id,
        holder_name=t.holder_name if t else "Visitor",
        category=t.category if t else None,
        gate=s.gate or (t.gate if t else None),
        started_at=s.started_at,
        consent_given=s.consent_given,
        latitude=s.last_latitude,
        longitude=s.last_longitude,
        accuracy=s.last_accuracy,
        last_update_at=s.last_point_at,
        age_seconds=p.age_seconds,
        stale=p.stale,
    )


@router.get("/live", response_model=list[LivePositionOut])
def live(
    gate: str | None = Query(default=None, max_length=128),
    category: str | None = Query(default=None, max_length=8),
    min_age_minutes: int | None = Query(default=None, ge=0),
    max_age_minutes: int | None = Query(default=None, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(_view_locations),
) -> list[LivePositionOut]:
    rows = tracking.live_positions(
        db, gate=gate, category=category, min_age_minutes=min_age_minutes, max_age_minutes=max_age_minutes
    )
    db.commit()
    return [_position_out(p) for p in rows]


@router.get("/sessions/{session_id}/path", response_model=SessionPathOut)
def session_path(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    viewer: User = Depends(_view_locations),
) -> SessionPathOut:
    session = db.get(VisitSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    tracking.refresh_session(db, session)
    ticket = tracking.load_ticket(db, session.ticket_kind, session.ticket_id)
    points = db.scalars(
        select(LocationPoint).where(LocationPoint.session_id == session.id).order_by(LocationPoint.recorded_at)
    ).all()
    record_audit(db, action="view_path", entity_type="visit_session", entity_id=str(session.id), actor_user_id=viewer.id)
    db.commit()
    position = tracking.LivePosition(session=session, ticket=ticket, age_seconds=None, stale=False)
    return SessionPathOut(
        session=_position_out(position),
        points=[PathPointOut.model_validate(p, from_attributes=True) for p in points],
    )


@router.get("/poi-summary", response_model=list[PoiBusyOut])
def poi_summary(db: Session = Depends(get_db), _: User = Depends(_view_locations)) -> list[PoiBusyOut]:
    rows = tracking.poi_busy_counts(db)
    db.commit()
    return [
        PoiBusyOut(
            poi_id=poi.id, name=poi.name, kind=poi.kind, latitude=poi.latitude,
            longitude=poi.longitude, radius_m=poi.radius_m, visitors_near=n,
        )
        for poi, n in rows
    ]


# --- points of interest (management) ---


def _check_activity(db: Session, activity_id) -> None:
    if activity_id is not None and db.get(Activity, activity_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")


@router.get("/pois", response_model=list[PoiOut])
def list_pois(db: Session = Depends(get_db), _: User = Depends(_manage_roles)) -> list[PoiOut]:
    rows = db.scalars(select(PointOfInterest).order_by(PointOfInterest.name)).all()
    return [PoiOut.model_validate(p) for p in rows]


@router.post("/pois", response_model=PoiOut, status_code=status.HTTP_201_CREATED)
def create_poi(payload: PoiCreate, db: Session = Depends(get_db), actor: User = Depends(_manage_roles)) -> PoiOut:
    _check_activity(db, payload.activity_id)
    poi = PointOfInterest(**payload.model_dump())
    db.add(poi)
    db.flush()
    record_audit(db, action="create", entity_type="point_of_interest", entity_id=str(poi.id), actor_user_id=actor.id)
    return PoiOut.model_validate(poi)


@router.patch("/pois/{poi_id}", response_model=PoiOut)
def update_poi(
    poi_id: uuid.UUID, payload: PoiUpdate, db: Session = Depends(get_db), actor: User = Depends(_manage_roles)
) -> PoiOut:
    poi = db.get(PointOfInterest, poi_id)
    if poi is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Point of interest not found")
    changes = payload.model_dump(exclude_unset=True)
    _check_activity(db, changes.get("activity_id"))
    for field, value in changes.items():
        setattr(poi, field, value)
    db.flush()
    record_audit(db, action="update", entity_type="point_of_interest", entity_id=str(poi.id), actor_user_id=actor.id)
    return PoiOut.model_validate(poi)


@router.delete("/pois/{poi_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_poi(poi_id: uuid.UUID, db: Session = Depends(get_db), actor: User = Depends(_manage_roles)) -> Response:
    poi = db.get(PointOfInterest, poi_id)
    if poi is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Point of interest not found")
    db.delete(poi)
    record_audit(db, action="delete", entity_type="point_of_interest", entity_id=str(poi_id), actor_user_id=actor.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
