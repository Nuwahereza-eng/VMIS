"""Periodic reporting (build prompt section 4.1, Dashboard/reporting).

Produces daily / weekly / monthly / quarterly / annual summaries over a date
range: how many visitors were registered, how many entries were recorded, how
many activities were captured, and revenue per currency. Records are bucketed
in Python (not with database-specific date functions) so the same code runs on
both SQLite and PostgreSQL. Money is kept per currency and never summed across
currencies.
"""

import csv
import enum
import io
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import ensure_utc
from app.models.booking import VisitorActivity
from app.models.visit import Visit
from app.models.visitor import Visitor


class Granularity(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"


@dataclass
class ReportRow:
    period: str
    visitors_registered: int = 0
    entries: int = 0
    activities: int = 0
    # Currency code -> minor units. Never merged across currencies.
    revenue: dict[str, int] = field(default_factory=dict)


@dataclass
class Report:
    granularity: str
    start: datetime
    end: datetime
    rows: list[ReportRow]


def period_key(moment: datetime, granularity: Granularity) -> str:
    """A stable, sortable bucket label for a timestamp at the given granularity."""
    moment = ensure_utc(moment)
    if granularity is Granularity.DAILY:
        return moment.strftime("%Y-%m-%d")
    if granularity is Granularity.WEEKLY:
        iso_year, iso_week, _ = moment.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    if granularity is Granularity.MONTHLY:
        return moment.strftime("%Y-%m")
    if granularity is Granularity.QUARTERLY:
        quarter = (moment.month - 1) // 3 + 1
        return f"{moment.year}-Q{quarter}"
    return str(moment.year)  # ANNUAL


def _coerce_range(start: datetime | date | None, end: datetime | date | None) -> tuple[datetime, datetime]:
    def _as_dt(value: datetime | date | None, default: datetime) -> datetime:
        if value is None:
            return default
        if isinstance(value, datetime):
            return ensure_utc(value)
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    lo = _as_dt(start, datetime(1970, 1, 1, tzinfo=timezone.utc))
    hi = _as_dt(end, now)
    return lo, hi


def build_report(
    db: Session,
    granularity: Granularity,
    start: datetime | date | None = None,
    end: datetime | date | None = None,
) -> Report:
    lo, hi = _coerce_range(start, end)
    buckets: dict[str, ReportRow] = {}

    def _row(moment: datetime) -> ReportRow:
        key = period_key(moment, granularity)
        row = buckets.get(key)
        if row is None:
            row = ReportRow(period=key)
            buckets[key] = row
        return row

    def _in_range(moment: datetime | None) -> datetime | None:
        if moment is None:
            return None
        aware = ensure_utc(moment)
        return aware if lo <= aware <= hi else None

    for visitor in db.scalars(select(Visitor)).all():
        when = _in_range(visitor.created_at)
        if when is not None:
            _row(when).visitors_registered += 1

    for visit in db.scalars(select(Visit)).all():
        when = _in_range(visit.entry_timestamp)
        if when is not None:
            _row(when).entries += 1

    for line in db.scalars(select(VisitorActivity)).all():
        when = _in_range(line.created_at)
        if when is None:
            continue
        row = _row(when)
        row.activities += 1
        row.revenue[line.currency] = row.revenue.get(line.currency, 0) + line.amount_minor

    rows = [buckets[key] for key in sorted(buckets)]
    return Report(granularity=granularity.value, start=lo, end=hi, rows=rows)


def report_to_csv(report: Report) -> str:
    """Flatten a report to CSV. Revenue expands to one column per currency seen."""
    currencies = sorted({cur for row in report.rows for cur in row.revenue})
    header = ["period", "visitors_registered", "entries", "activities"]
    header += [f"revenue_{cur}" for cur in currencies]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in report.rows:
        writer.writerow(
            [row.period, row.visitors_registered, row.entries, row.activities]
            + [row.revenue.get(cur, 0) for cur in currencies]
        )
    return buffer.getvalue()
