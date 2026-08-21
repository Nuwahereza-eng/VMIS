"""Per-visitor activity/fee capture and accommodation (build prompt section 4.1).

Adding an activity computes its fee automatically from the visitor's category
and stores it as integer minor units with currency. Multiple activities per
visitor are allowed; each add is idempotent on a client-supplied UUID for safe
offline replay. Accommodation records a facility and nights. The charges summary
totals fees per currency (money is never summed across currencies).

Activity/fee capture is an activity-station officer's job (build prompt
section 6); management may also act. All officer roles may read.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.fees import RateNotFound, quote_activity_fee
from app.models.activity import Activity
from app.models.booking import Accommodation, VisitorActivity
from app.models.enums import Role
from app.models.user import User
from app.models.visitor import Visitor
from app.rbac import require_roles
from app.schemas import (
    AccommodationCreate,
    AccommodationOut,
    AccommodationResult,
    CurrencyTotal,
    VisitorActivityCreate,
    VisitorActivityOut,
    VisitorActivityResult,
    VisitorChargesSummary,
)

router = APIRouter(prefix="/visitors/{visitor_id}", tags=["charges"])

_capture_roles = require_roles(Role.ACTIVITY_OFFICER, Role.MANAGEMENT)
_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


def _get_visitor_or_404(db: Session, visitor_id: uuid.UUID) -> Visitor:
    visitor = db.get(Visitor, visitor_id)
    if visitor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visitor not found")
    return visitor


@router.post("/activities", response_model=VisitorActivityResult, status_code=status.HTTP_201_CREATED)
def add_activity(
    visitor_id: uuid.UUID,
    payload: VisitorActivityCreate,
    response: Response,
    db: Session = Depends(get_db),
    officer: User = Depends(_capture_roles),
) -> VisitorActivityResult:
    if payload.id is not None:
        existing = db.get(VisitorActivity, payload.id)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return VisitorActivityResult(
                activity=VisitorActivityOut.model_validate(existing, from_attributes=True),
                idempotent=True,
            )

    visitor = _get_visitor_or_404(db, visitor_id)

    activity = db.get(Activity, payload.activity_id)
    if activity is None or not activity.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    try:
        quote = quote_activity_fee(db, activity, visitor.category, payload.quantity)
    except RateNotFound as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    line = VisitorActivity(
        id=payload.id or uuid.uuid4(),
        visitor_id=visitor.id,
        activity_id=activity.id,
        category=visitor.category,
        quantity=payload.quantity,
        unit_amount_minor=quote.unit_amount_minor,
        amount_minor=quote.amount_minor,
        currency=quote.currency,
        origin_station_id=payload.origin_station_id or officer.station_id,
        client_created_at=payload.client_created_at,
    )
    db.add(line)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="visitor_activity",
        entity_id=str(line.id),
        actor_user_id=officer.id,
        details={"activity": activity.code, "amount_minor": line.amount_minor, "currency": line.currency},
    )
    return VisitorActivityResult(
        activity=VisitorActivityOut.model_validate(line, from_attributes=True)
    )


@router.get("/activities", response_model=list[VisitorActivityOut])
def list_visitor_activities(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[VisitorActivity]:
    _get_visitor_or_404(db, visitor_id)
    return list(
        db.scalars(
            select(VisitorActivity)
            .where(VisitorActivity.visitor_id == visitor_id)
            .order_by(VisitorActivity.created_at)
        )
    )


@router.post("/accommodations", response_model=AccommodationResult, status_code=status.HTTP_201_CREATED)
def add_accommodation(
    visitor_id: uuid.UUID,
    payload: AccommodationCreate,
    response: Response,
    db: Session = Depends(get_db),
    officer: User = Depends(_capture_roles),
) -> AccommodationResult:
    if payload.id is not None:
        existing = db.get(Accommodation, payload.id)
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return AccommodationResult(
                accommodation=AccommodationOut.model_validate(existing, from_attributes=True),
                idempotent=True,
            )

    _get_visitor_or_404(db, visitor_id)

    record = Accommodation(
        id=payload.id or uuid.uuid4(),
        visitor_id=visitor_id,
        facility=payload.facility,
        nights=payload.nights,
        origin_station_id=payload.origin_station_id or officer.station_id,
        client_created_at=payload.client_created_at,
    )
    db.add(record)
    db.flush()
    record_audit(
        db,
        action="create",
        entity_type="accommodation",
        entity_id=str(record.id),
        actor_user_id=officer.id,
        details={"facility": record.facility, "nights": record.nights},
    )
    return AccommodationResult(
        accommodation=AccommodationOut.model_validate(record, from_attributes=True)
    )


@router.get("/accommodations", response_model=list[AccommodationOut])
def list_visitor_accommodations(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[Accommodation]:
    _get_visitor_or_404(db, visitor_id)
    return list(
        db.scalars(
            select(Accommodation)
            .where(Accommodation.visitor_id == visitor_id)
            .order_by(Accommodation.created_at)
        )
    )


@router.get("/charges", response_model=VisitorChargesSummary)
def get_visitor_charges(
    visitor_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> VisitorChargesSummary:
    _get_visitor_or_404(db, visitor_id)
    activities = list(
        db.scalars(
            select(VisitorActivity)
            .where(VisitorActivity.visitor_id == visitor_id)
            .order_by(VisitorActivity.created_at)
        )
    )
    accommodations = list(
        db.scalars(
            select(Accommodation)
            .where(Accommodation.visitor_id == visitor_id)
            .order_by(Accommodation.created_at)
        )
    )

    totals: dict[str, int] = {}
    for line in activities:
        totals[line.currency] = totals.get(line.currency, 0) + line.amount_minor

    return VisitorChargesSummary(
        visitor_id=visitor_id,
        activities=[VisitorActivityOut.model_validate(a, from_attributes=True) for a in activities],
        accommodations=[AccommodationOut.model_validate(a, from_attributes=True) for a in accommodations],
        totals=[CurrencyTotal(currency=c, amount_minor=amt) for c, amt in sorted(totals.items())],
    )
