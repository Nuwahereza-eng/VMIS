"""Checkpoint scanning + visitor status (supervisor priority 3).

Officers scan a visitor's QR code at the entrance, at internal checkpoints, and
at exit. Each scan stores the date, time, and location, and the visitor's
derived status is recomputed from the resulting trail. Scans are recorded
online-first (no offline queue yet); status is always derived, never stored.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.base import utcnow
from app.models.enums import Role, ScanKind
from app.models.scan import ScanEvent
from app.models.user import User
from app.models.visitor import Visitor
from app.rbac import require_roles
from app.schemas import ScanCreate, ScanOut, ScanResult, VisitorStatusOut
from app.visitor_status import _scan_out, compute_status, latest_open_visit

router = APIRouter(prefix="/visitors", tags=["scans"])

# Any officer can scan at a checkpoint; management can act too.
_scan_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


def _require_visitor(db: Session, visitor_id: uuid.UUID) -> Visitor:
    visitor = db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")
    return visitor


@router.post("/{visitor_id}/scans", response_model=ScanResult, status_code=status.HTTP_201_CREATED)
def record_scan(
    visitor_id: uuid.UUID,
    payload: ScanCreate,
    response: Response,
    db: Session = Depends(get_db),
    officer: User = Depends(_scan_roles),
) -> ScanResult:
    _require_visitor(db, visitor_id)

    # Idempotent replay: the same scan id must not create a second row.
    if payload.id is not None:
        existing = db.get(ScanEvent, payload.id)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return ScanResult(
                scan=_scan_out(existing),
                idempotent=True,
                status=compute_status(db, visitor_id),
            )

    # Link the scan to the visitor's current open visit when there is one.
    open_visit = latest_open_visit(db, visitor_id)

    scan = ScanEvent(
        id=payload.id or uuid.uuid4(),
        visitor_id=visitor_id,
        visit_id=open_visit.id if open_visit is not None else None,
        kind=payload.kind,
        location=payload.location or officer.station_id or "UNKNOWN",
        scanned_at=payload.scanned_at or utcnow(),
        officer_id=officer.id,
        origin_station_id=payload.origin_station_id or officer.station_id,
        client_created_at=payload.client_created_at,
    )
    db.add(scan)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="scan_event",
        entity_id=str(scan.id),
        actor_user_id=officer.id,
        details={"kind": scan.kind.value, "location": scan.location},
    )
    return ScanResult(scan=_scan_out(scan), status=compute_status(db, visitor_id))


@router.get("/{visitor_id}/scans", response_model=list[ScanOut])
def list_scans(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[ScanOut]:
    _require_visitor(db, visitor_id)
    scans = db.scalars(
        select(ScanEvent)
        .where(ScanEvent.visitor_id == visitor_id)
        .order_by(ScanEvent.scanned_at.desc())
    ).all()
    return [_scan_out(s) for s in scans]


@router.get("/{visitor_id}/status", response_model=VisitorStatusOut)
def get_status(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> VisitorStatusOut:
    _require_visitor(db, visitor_id)
    return compute_status(db, visitor_id)
