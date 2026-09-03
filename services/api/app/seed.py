"""Load the activity catalogue and rates from the tariff fixture.

Idempotent: activities and rates are matched by their stable keys, so running
the seed twice does not create duplicates and updates changed amounts in place.
The bundled file is a DEVELOPMENT fixture with placeholder figures; the real UWA
tariff must be confirmed and loaded before production (build prompt section 4.3).
"""

import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.activity import Activity, ActivityRate
from app.models.config import Facility, Gate
from app.models.enums import CATEGORY_CURRENCY, VisitorCategory

_DEFAULT_FIXTURE = Path(__file__).parent / "seeds" / "tariff_dev.json"

# Initial master lists mirror the previous hardcoded frontend reference lists.
# They are only inserted when the table is empty, so management edits (renames,
# deletions, deactivations) are never overwritten on restart.
_DEFAULT_GATES = [
    "Kichumbanyobo Gate",
    "Tangi Gate",
    "Bugungu Gate",
    "Wankwar Gate",
    "Chobe Gate",
    "Mubako Gate",
]

_DEFAULT_FACILITIES = [
    "Paraa Safari Lodge",
    "Pakuba Safari Lodge",
    "Nile Safari Lodge",
    "Fort Murchison",
    "Red Chilli Rest Camp",
    "Sambiya River Lodge",
    "UWA Campsite",
    "Community Campsite",
    "Outside the park",
]



def seed_tariff(db: Session, fixture_path: Path | None = None) -> int:
    """Upsert activities and rates from the fixture. Returns activity count."""
    path = fixture_path or _DEFAULT_FIXTURE
    data = json.loads(path.read_text())

    for entry in data["activities"]:
        activity = db.scalar(select(Activity).where(Activity.code == entry["code"]))
        if activity is None:
            activity = Activity(code=entry["code"], name=entry["name"], is_free=entry["is_free"])
            db.add(activity)
            db.flush()
        else:
            activity.name = entry["name"]
            activity.is_free = entry["is_free"]

        for category_name, amount_minor in entry.get("rates", {}).items():
            category = VisitorCategory(category_name)
            currency = CATEGORY_CURRENCY[category]
            rate = db.scalar(
                select(ActivityRate).where(
                    ActivityRate.activity_id == activity.id,
                    ActivityRate.category == category,
                )
            )
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

    db.commit()
    return len(data["activities"])


def seed_gates(db: Session) -> int:
    """Insert the default gate list only when the gates table is empty."""
    if db.scalar(select(func.count()).select_from(Gate)):
        return 0
    for name in _DEFAULT_GATES:
        db.add(Gate(name=name, is_active=True))
    db.commit()
    return len(_DEFAULT_GATES)


def seed_facilities(db: Session) -> int:
    """Insert the default facility list only when the facilities table is empty."""
    if db.scalar(select(func.count()).select_from(Facility)):
        return 0
    for name in _DEFAULT_FACILITIES:
        db.add(Facility(name=name, is_active=True))
    db.commit()
    return len(_DEFAULT_FACILITIES)
