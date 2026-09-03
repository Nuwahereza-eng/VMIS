"""Activity catalogue and management (build prompt section 4.1).

Reading the catalogue (activities and their per-category rates) is open to all
officer roles. Creating, editing, re-pricing, and deleting activities is
management-only configuration. Amounts are always integer minor units and the
currency is derived from the visitor category (CATEGORY_CURRENCY).
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.db import get_db
from app.models.activity import Activity, ActivityRate
from app.models.booking import VisitorActivity
from app.models.enums import CATEGORY_CURRENCY, Role
from app.models.user import User
from app.rbac import require_roles
from app.schemas import (
    ActivityCatalogueEntry,
    ActivityCreate,
    ActivityRateInput,
    ActivityRateOut,
    ActivityUpdate,
)

router = APIRouter(prefix="/activities", tags=["activities"])

_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)
_manage_roles = require_roles(Role.MANAGEMENT)


def _catalogue_entry(db: Session, activity: Activity) -> ActivityCatalogueEntry:
    rates = db.scalars(
        select(ActivityRate).where(ActivityRate.activity_id == activity.id)
    ).all()
    entry = ActivityCatalogueEntry.model_validate(activity, from_attributes=True)
    entry.rates = [ActivityRateOut.model_validate(r, from_attributes=True) for r in rates]
    return entry


def _apply_rates(db: Session, activity: Activity, rates: list[ActivityRateInput]) -> None:
    """Replace an activity's rates with the supplied set (upsert + prune)."""
    supplied = {r.category: r.amount_minor for r in rates}
    existing = {
        rate.category: rate
        for rate in db.scalars(
            select(ActivityRate).where(ActivityRate.activity_id == activity.id)
        ).all()
    }
    for category, amount_minor in supplied.items():
        currency = CATEGORY_CURRENCY[category]
        rate = existing.get(category)
        if rate is None:
            db.add(
                ActivityRate(
                    activity_id=activity.id,
                    category=category,
                    amount_minor=amount_minor,
                    currency=currency,
                )
            )
        else:
            rate.amount_minor = amount_minor
            rate.currency = currency
    # Prune categories that are no longer supplied.
    for category, rate in existing.items():
        if category not in supplied:
            db.delete(rate)


@router.get("", response_model=list[ActivityCatalogueEntry])
def list_activities(
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[ActivityCatalogueEntry]:
    activities = db.scalars(select(Activity).order_by(Activity.name)).all()
    return [_catalogue_entry(db, activity) for activity in activities]


@router.post("", response_model=ActivityCatalogueEntry, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> ActivityCatalogueEntry:
    existing = db.scalar(select(Activity).where(Activity.code == payload.code))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Activity code already exists"
        )
    activity = Activity(
        code=payload.code,
        name=payload.name,
        is_free=payload.is_free,
        is_active=payload.is_active,
    )
    db.add(activity)
    db.flush()
    if not payload.is_free:
        _apply_rates(db, activity, payload.rates)
    record_audit(
        db,
        action="create",
        entity_type="activity",
        entity_id=str(activity.id),
        actor_user_id=actor.id,
        details={"code": activity.code, "is_free": activity.is_free},
    )
    db.flush()
    return _catalogue_entry(db, activity)


@router.patch("/{activity_id}", response_model=ActivityCatalogueEntry)
def update_activity(
    activity_id: uuid.UUID,
    payload: ActivityUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> ActivityCatalogueEntry:
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    changed: list[str] = []
    if payload.name is not None:
        activity.name = payload.name
        changed.append("name")
    if payload.is_free is not None:
        activity.is_free = payload.is_free
        changed.append("is_free")
    if payload.is_active is not None:
        activity.is_active = payload.is_active
        changed.append("is_active")
    db.flush()
    record_audit(
        db,
        action="update",
        entity_type="activity",
        entity_id=str(activity.id),
        actor_user_id=actor.id,
        details={"fields": changed},
    )
    return _catalogue_entry(db, activity)


@router.put("/{activity_id}/rates", response_model=ActivityCatalogueEntry)
def set_activity_rates(
    activity_id: uuid.UUID,
    rates: list[ActivityRateInput],
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> ActivityCatalogueEntry:
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    _apply_rates(db, activity, rates)
    db.flush()
    record_audit(
        db,
        action="update_rates",
        entity_type="activity",
        entity_id=str(activity.id),
        actor_user_id=actor.id,
        details={"categories": [r.category.value for r in rates]},
    )
    return _catalogue_entry(db, activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: uuid.UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(_manage_roles),
) -> Response:
    activity = db.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    # If any visitor has been charged for this activity, keep the history intact
    # and refuse the hard delete: management should deactivate it instead.
    referenced = db.scalar(
        select(VisitorActivity.id).where(VisitorActivity.activity_id == activity.id).limit(1)
    )
    if referenced is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Activity has captured bookings; deactivate it instead of deleting.",
        )

    for rate in db.scalars(
        select(ActivityRate).where(ActivityRate.activity_id == activity.id)
    ).all():
        db.delete(rate)
    record_audit(
        db,
        action="delete",
        entity_type="activity",
        entity_id=str(activity.id),
        actor_user_id=actor.id,
        details={"code": activity.code},
    )
    db.delete(activity)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
