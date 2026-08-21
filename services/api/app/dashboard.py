"""Live dashboard aggregates (build prompt section 4.1, Dashboard/reporting).

Everything here is derived on request from the system of record. Counts of
visitors currently inside come from open stays; revenue is summed per currency
from stored activity charges (never across currencies); per-station last-sync
time is the most recent processed operation for each station. Alerts are
folded in so a supervisor sees the whole picture in one call.
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.alerts import compute_alerts
from app.models.activity import Activity
from app.models.base import ensure_utc
from app.models.booking import Accommodation, VisitorActivity
from app.models.enums import VisitorCategory
from app.models.sync import SyncOperation
from app.models.visit import Visit
from app.models.visitor import Visitor


@dataclass
class Count:
    label: str
    count: int


@dataclass
class CurrencyTotal:
    currency: str
    amount_minor: int


@dataclass
class StationSync:
    station_id: str
    last_sync_at: datetime
    operations: int


@dataclass
class Dashboard:
    inside_now: int
    by_gate: list[Count] = field(default_factory=list)
    by_category: list[Count] = field(default_factory=list)
    by_activity: list[Count] = field(default_factory=list)
    by_lodge: list[Count] = field(default_factory=list)
    revenue: list[CurrencyTotal] = field(default_factory=list)
    stations: list[StationSync] = field(default_factory=list)
    alert_counts: list[Count] = field(default_factory=list)


def build_dashboard(db: Session, now: datetime | None = None) -> Dashboard:
    inside_now = db.scalar(
        select(func.count()).select_from(Visit).where(Visit.exit_timestamp.is_(None))
    )

    by_gate = [
        Count(label=gate, count=n)
        for gate, n in db.execute(
            select(Visit.entry_gate, func.count())
            .where(Visit.exit_timestamp.is_(None))
            .group_by(Visit.entry_gate)
            .order_by(Visit.entry_gate)
        ).all()
    ]

    by_category = [
        Count(label=_category_label(cat), count=n)
        for cat, n in db.execute(
            select(Visitor.category, func.count())
            .join(Visit, Visit.visitor_id == Visitor.id)
            .where(Visit.exit_timestamp.is_(None))
            .group_by(Visitor.category)
        ).all()
    ]

    by_activity = [
        Count(label=name, count=n)
        for name, n in db.execute(
            select(Activity.name, func.count())
            .join(VisitorActivity, VisitorActivity.activity_id == Activity.id)
            .group_by(Activity.name)
            .order_by(Activity.name)
        ).all()
    ]

    by_lodge = [
        Count(label=facility, count=n)
        for facility, n in db.execute(
            select(Accommodation.facility, func.count())
            .group_by(Accommodation.facility)
            .order_by(Accommodation.facility)
        ).all()
    ]

    revenue = [
        CurrencyTotal(currency=currency, amount_minor=int(total or 0))
        for currency, total in db.execute(
            select(VisitorActivity.currency, func.sum(VisitorActivity.amount_minor))
            .group_by(VisitorActivity.currency)
            .order_by(VisitorActivity.currency)
        ).all()
    ]

    stations = [
        StationSync(
            station_id=station_id,
            last_sync_at=ensure_utc(last_at),
            operations=int(ops),
        )
        for station_id, last_at, ops in db.execute(
            select(
                SyncOperation.station_id,
                func.max(SyncOperation.created_at),
                func.count(),
            )
            .where(SyncOperation.station_id.is_not(None))
            .group_by(SyncOperation.station_id)
            .order_by(SyncOperation.station_id)
        ).all()
    ]

    alerts = compute_alerts(db, now)
    counts: dict[str, int] = {}
    for alert in alerts:
        counts[alert.kind.value] = counts.get(alert.kind.value, 0) + 1
    alert_counts = [Count(label=kind, count=n) for kind, n in sorted(counts.items())]

    return Dashboard(
        inside_now=int(inside_now or 0),
        by_gate=by_gate,
        by_category=by_category,
        by_activity=by_activity,
        by_lodge=by_lodge,
        revenue=revenue,
        stations=stations,
        alert_counts=alert_counts,
    )


def _category_label(cat: VisitorCategory) -> str:
    return cat.value if isinstance(cat, VisitorCategory) else str(cat)
