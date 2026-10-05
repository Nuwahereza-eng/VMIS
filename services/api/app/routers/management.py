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
from app.reconciliation import build_reconciliation
from app.reminders import build_reminders
from app.reports import Granularity, build_report, report_to_csv
from app.retention import enforce_retention
from app.schemas import (
    AlertOut,
    CountOut,
    CurrencyTotal,
    DashboardOut,
    GateReconciliationOut,
    OriginRevenueOut,
    ReconciliationOut,
    ReminderItemOut,
    RemindersOut,
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
        by_origin=[CountOut(label=c.label, count=c.count) for c in board.by_origin],
        revenue=[CurrencyTotal(currency=r.currency, amount_minor=r.amount_minor) for r in board.revenue],
        revenue_today=[CurrencyTotal(currency=r.currency, amount_minor=r.amount_minor) for r in board.revenue_today],
        revenue_by_origin=[
            OriginRevenueOut(
                origin=o.origin,
                totals=[CurrencyTotal(currency=t.currency, amount_minor=t.amount_minor) for t in o.totals],
            )
            for o in board.revenue_by_origin
        ],
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
            visitor_name=a.visitor_name,
            visitor_category=a.visitor_category,
            nationality=a.nationality,
            ticket_number=a.ticket_number,
            nights_purchased=a.nights_purchased,
            expiry_timestamp=a.expiry_timestamp,
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


@router.get("/reconciliation", response_model=ReconciliationOut)
def get_reconciliation(
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> ReconciliationOut:
    data = build_reconciliation(db)
    return ReconciliationOut(
        gates=[
            GateReconciliationOut(
                gate=g.gate,
                expected=g.expected,
                entries=g.entries,
                distinct_visitors=g.distinct_visitors,
                inside_now=g.inside_now,
                exited=g.exited,
                revenue=[
                    CurrencyTotal(currency=t.currency, amount_minor=t.amount_minor)
                    for t in g.revenue
                ],
            )
            for g in data.gates
        ],
        totals=[CurrencyTotal(currency=t.currency, amount_minor=t.amount_minor) for t in data.totals],
        unassigned_revenue=[
            CurrencyTotal(currency=t.currency, amount_minor=t.amount_minor)
            for t in data.unassigned_revenue
        ],
        total_expected=data.total_expected,
        total_entries=data.total_entries,
        total_inside=data.total_inside,
        total_exited=data.total_exited,
    )


def _reminder_out(item) -> ReminderItemOut:
    return ReminderItemOut(
        booking_id=item.booking_id,
        full_name=item.full_name,
        intended_date=item.intended_date,
        days_until=item.days_until,
        kind=item.kind,
        label=item.label,
        party_size=item.party_size,
        expected_gate=item.expected_gate,
        country=item.country,
        phone=item.phone,
        email=item.email,
        contactable=item.contactable,
    )


@router.get("/reminders", response_model=RemindersOut)
def get_reminders(
    db: Session = Depends(get_db),
    _: User = Depends(_management),
) -> RemindersOut:
    data = build_reminders(db)
    return RemindersOut(
        reference_date=data.reference_date,
        due_now=[_reminder_out(i) for i in data.due_now],
        upcoming=[_reminder_out(i) for i in data.upcoming],
        overdue=[_reminder_out(i) for i in data.overdue],
        week_before_count=data.week_before_count,
        day_before_count=data.day_before_count,
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
                pre_booked=row.pre_booked,
                walk_in=row.walk_in,
                activities=row.activities,
                revenue=[
                    CurrencyTotal(currency=cur, amount_minor=amt)
                    for cur, amt in sorted(row.revenue.items())
                ],
                revenue_pre_booked=[
                    CurrencyTotal(currency=cur, amount_minor=amt)
                    for cur, amt in sorted(row.revenue_pre_booked.items())
                ],
                revenue_walk_in=[
                    CurrencyTotal(currency=cur, amount_minor=amt)
                    for cur, amt in sorted(row.revenue_walk_in.items())
                ],
            )
            for row in report.rows
        ],
    )
