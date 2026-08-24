"""Management dashboard, alerts, reporting, and retention (Sprint 6).

Everything here is management-only (build prompt section 6): the live dashboard
with counts/revenue/last-sync, the operational alerts queue, exportable
periodic reports, and the PII retention control. Reads are derived on request
from the system of record; nothing is cached as a source of truth.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.alerts import compute_alerts
from app.audit import record_audit
from app.dashboard import build_dashboard
from app.db import get_db
from app.models.enums import Role
from app.models.user import User
from app.rbac import require_roles
from app.reports import Granularity, build_report, report_to_csv
from app.retention import enforce_retention
from app.schemas import (
    AlertOut,
    CountOut,
    CurrencyTotal,
    DashboardOut,
    ReportOut,
    ReportRowOut,
    RetentionResultOut,
    StationSyncOut,
)
from app.config import get_settings

router = APIRouter(prefix="/management", tags=["management"])

_management = require_roles(Role.MANAGEMENT)


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> DashboardOut:
    board = build_dashboard(db)
    return DashboardOut(
        inside_now=board.inside_now,
        entered_today=board.entered_today,
        exited_today=board.exited_today,
        expired_tickets=board.expired_tickets,
        average_stay_hours=board.average_stay_hours,
        by_gate=[CountOut(label=c.label, count=c.count) for c in board.by_gate],
        by_category=[CountOut(label=c.label, count=c.count) for c in board.by_category],
        by_activity=[CountOut(label=c.label, count=c.count) for c in board.by_activity],
        by_lodge=[CountOut(label=c.label, count=c.count) for c in board.by_lodge],
        revenue=[CurrencyTotal(currency=r.currency, amount_minor=r.amount_minor) for r in board.revenue],
        revenue_today=[CurrencyTotal(currency=r.currency, amount_minor=r.amount_minor) for r in board.revenue_today],
        stations=[
            StationSyncOut(station_id=s.station_id, last_sync_at=s.last_sync_at, operations=s.operations)
            for s in board.stations
        ],
        alert_counts=[CountOut(label=c.label, count=c.count) for c in board.alert_counts],
    )


@router.get("/alerts", response_model=list[AlertOut])
def get_alerts(
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> list[AlertOut]:
    return [
        AlertOut(
            kind=a.kind.value,
            visit_id=a.visit_id,
            visitor_id=a.visitor_id,
            entry_gate=a.entry_gate,
            entry_timestamp=a.entry_timestamp,
            detail=a.detail,
        )
        for a in compute_alerts(db)
    ]


@router.get("/reports", response_model=ReportOut)
def get_report(
    granularity: Granularity = Query(default=Granularity.MONTHLY),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> ReportOut:
    report = build_report(db, granularity, start, end)
    return _report_out(report)


@router.get("/reports.csv")
def get_report_csv(
    granularity: Granularity = Query(default=Granularity.MONTHLY),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> Response:
    report = build_report(db, granularity, start, end)
    body = report_to_csv(report)
    filename = f"vmis_report_{granularity.value}.csv"
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/retention/enforce", response_model=RetentionResultOut)
def run_retention(
    db: Session = Depends(get_db),
    actor: User = Depends(_management),
) -> RetentionResultOut:
    result = enforce_retention(db, actor_user_id=actor.id)
    record_audit(
        db,
        action="retention",
        entity_type="visitor",
        entity_id=None,
        actor_user_id=actor.id,
        details={"redacted": result.redacted},
    )
    return RetentionResultOut(
        cutoff=result.cutoff,
        redacted=result.redacted,
        retention_days=get_settings().pii_retention_days,
    )


def _report_out(report) -> ReportOut:
    return ReportOut(
        granularity=report.granularity,
        start=report.start,
        end=report.end,
        rows=[
            ReportRowOut(
                period=row.period,
                visitors_registered=row.visitors_registered,
                entries=row.entries,
                activities=row.activities,
                revenue=[
                    CurrencyTotal(currency=cur, amount_minor=amt)
                    for cur, amt in sorted(row.revenue.items())
                ],
            )
            for row in report.rows
        ],
    )
