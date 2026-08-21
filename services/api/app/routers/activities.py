"""Activity catalogue (build prompt section 4.1).

Read-only listing of bookable activities and their per-category rates. All
officer roles may read the catalogue; it is seeded from the tariff fixture.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.activity import Activity, ActivityRate
from app.models.enums import Role
from app.models.user import User
from app.rbac import require_roles
from app.schemas import ActivityCatalogueEntry, ActivityRateOut

router = APIRouter(prefix="/activities", tags=["activities"])

_read_roles = require_roles(Role.GATE_OFFICER, Role.ACTIVITY_OFFICER, Role.MANAGEMENT)


@router.get("", response_model=list[ActivityCatalogueEntry])
def list_activities(
    db: Session = Depends(get_db),
    _: User = Depends(_read_roles),
) -> list[ActivityCatalogueEntry]:
    activities = db.scalars(select(Activity).order_by(Activity.name)).all()
    result: list[ActivityCatalogueEntry] = []
    for activity in activities:
        rates = db.scalars(
            select(ActivityRate).where(ActivityRate.activity_id == activity.id)
        ).all()
        entry = ActivityCatalogueEntry.model_validate(activity, from_attributes=True)
        entry.rates = [ActivityRateOut.model_validate(r, from_attributes=True) for r in rates]
        result.append(entry)
    return result
