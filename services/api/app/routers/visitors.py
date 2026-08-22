"""Visitor registration and identification (Sprint 2).

Registration is optimistic and offline-friendly: clients may supply a
station-generated UUID, and re-posting the same id is idempotent (no duplicate
record), which is what makes sync replay safe later. A duplicate check on
id_number + name warns the officer without blocking. QR codes encode only the
visitor identifier and are verified by resolving that identifier against the
record.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.models.visit import Visit
from app.models.visitor import Visitor
from app.qr import InvalidQrPayload, build_qr_payload, parse_qr_payload, render_qr_png
from app.rbac import require_roles
from app.schemas import (
    DuplicateMatch,
    RegistrationResult,
    VerifyRequest,
    VerifyResult,
    VisitorCreate,
    VisitorListItem,
    VisitorListOut,
    VisitorOut,
)

router = APIRouter(prefix="/visitors", tags=["visitors"])

# Registration and identity checks happen at the gate; management can do both.
# Activity-station officers cannot register visitors (build prompt section 6).
_register_roles = require_roles(Role.GATE_OFFICER, Role.MANAGEMENT)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)
# The park-wide visitor registry is a management view (build prompt section 6):
# officers only see records synced to their own device, management sees all.
_registry_roles = require_roles(Role.MANAGEMENT)


@router.get("", response_model=VisitorListOut)
def list_visitors(
    search: str | None = Query(default=None, max_length=64),
    category: str | None = Query(default=None, max_length=8),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(_registry_roles),
) -> VisitorListOut:
    """Park-wide visitor registry (management only).

    Officers work from their device's local store; management needs to browse
    every visitor that has reached the system of record. Supports a name/id
    search and category filter, and is paginated. ``is_inside`` and
    ``visit_count`` are derived per visitor from the visits table.
    """
    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(Visitor.full_name.ilike(term), Visitor.id_number.ilike(term)))
    if category:
        filters.append(Visitor.category == category)

    total = db.scalar(select(func.count()).select_from(Visitor).where(*filters)) or 0

    visitors = list(
        db.scalars(
            select(Visitor)
            .where(*filters)
            .order_by(Visitor.server_received_at.desc().nullslast(), Visitor.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()
    )

    ids = [v.id for v in visitors]
    open_ids: set[uuid.UUID] = set()
    counts: dict[uuid.UUID, int] = {}
    if ids:
        open_ids = set(
            db.scalars(
                select(Visit.visitor_id)
                .where(Visit.visitor_id.in_(ids), Visit.exit_timestamp.is_(None))
                .distinct()
            ).all()
        )
        for vid, n in db.execute(
            select(Visit.visitor_id, func.count())
            .where(Visit.visitor_id.in_(ids))
            .group_by(Visit.visitor_id)
        ).all():
            counts[vid] = n

    items = [
        VisitorListItem(
            **VisitorOut.model_validate(v).model_dump(),
            is_inside=v.id in open_ids,
            visit_count=counts.get(v.id, 0),
        )
        for v in visitors
    ]
    return VisitorListOut(total=total, items=items)


@router.post("", response_model=RegistrationResult, status_code=status.HTTP_201_CREATED)
def register_visitor(
    payload: VisitorCreate,
    response: Response,
    db: Session = Depends(get_db),
    officer: User = Depends(_register_roles),
) -> RegistrationResult:
    if not payload.privacy_notice_accepted:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Privacy notice must be accepted before registration",
        )

    # Idempotent replay: an offline write re-sent with the same id must not
    # create a second record (build prompt section 9: zero duplicates).
    if payload.id is not None:
        existing = db.get(Visitor, payload.id)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return RegistrationResult(visitor=VisitorOut.model_validate(existing), idempotent=True)

    # Non-blocking duplicate warning on id_number + name.
    matches = db.scalars(
        select(Visitor).where(
            Visitor.id_number == payload.id_number,
            Visitor.full_name == payload.full_name,
        )
    ).all()

    visitor = Visitor(
        id=payload.id or uuid.uuid4(),
        full_name=payload.full_name,
        id_number=payload.id_number,
        nationality=payload.nationality,
        category=payload.category,
        privacy_notice_accepted=True,
        origin_station_id=payload.origin_station_id or officer.station_id,
        client_created_at=payload.client_created_at,
    )
    db.add(visitor)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="visitor",
        entity_id=str(visitor.id),
        actor_user_id=officer.id,
        details={"category": visitor.category.value, "station": visitor.origin_station_id},
    )

    return RegistrationResult(
        visitor=VisitorOut.model_validate(visitor),
        duplicate_warning=[DuplicateMatch.model_validate(m, from_attributes=True) for m in matches],
    )


@router.get("/{visitor_id}", response_model=VisitorOut)
def get_visitor(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> Visitor:
    visitor = db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")
    return visitor


@router.get("/{visitor_id}/qr")
def get_visitor_qr(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> Response:
    visitor = db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")
    png = render_qr_png(build_qr_payload(visitor.id))
    return Response(content=png, media_type="image/png")


@router.post("/verify", response_model=VerifyResult)
def verify_visitor(
    request: VerifyRequest,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> VerifyResult:
    """Resolve a scanned QR payload to a visitor record.

    Online counterpart of the offline check a station performs against its local
    store. A malformed payload or unknown identifier returns ``found=False``
    rather than an error, so scanners can show a clear "not recognised" result.
    """
    try:
        visitor_id = parse_qr_payload(request.payload)
    except InvalidQrPayload:
        return VerifyResult(found=False)

    visitor = db.get(Visitor, visitor_id)
    if visitor is None:
        return VerifyResult(found=False)
    return VerifyResult(found=True, visitor=VisitorOut.model_validate(visitor))
