"""Visitor registration and identification (Sprint 2).

Registration is optimistic and offline-friendly: clients may supply a
station-generated UUID, and re-posting the same id is idempotent (no duplicate
record), which is what makes sync replay safe later. A duplicate check on
id_number + name warns the officer without blocking. QR codes encode only the
visitor identifier and are verified by resolving that identifier against the
record.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.models.visitor import Visitor
from app.qr import InvalidQrPayload, build_qr_payload, parse_qr_payload, render_qr_png
from app.rbac import require_roles
from app.schemas import (
    DuplicateMatch,
    RegistrationResult,
    VerifyRequest,
    VerifyResult,
    VisitorCreate,
    VisitorOut,
)

router = APIRouter(prefix="/visitors", tags=["visitors"])

# Registration and identity checks happen at the gate; management can do both.
# Activity-station officers cannot register visitors (build prompt section 6).
_register_roles = require_roles(Role.GATE_OFFICER, Role.MANAGEMENT)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


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
