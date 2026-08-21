"""Reporting engine and endpoint tests (Sprint 6, build prompt section 4.1)."""

import csv
import io
import uuid
from datetime import datetime, timezone

from app.models.visitor import Visitor
from app.reports import Granularity, build_report, period_key, report_to_csv
from tests.conftest import auth_header


def test_period_key_formats():
    dt = datetime(2026, 8, 21, 10, 0, tzinfo=timezone.utc)
    assert period_key(dt, Granularity.DAILY) == "2026-08-21"
    assert period_key(dt, Granularity.MONTHLY) == "2026-08"
    assert period_key(dt, Granularity.QUARTERLY) == "2026-Q3"
    assert period_key(dt, Granularity.ANNUAL) == "2026"
    assert period_key(dt, Granularity.WEEKLY).startswith("2026-W")


def _visitor(db, created_at):
    v = Visitor(
        id=uuid.uuid4(),
        full_name="Report Subject",
        id_number=f"SYN-{uuid.uuid4().hex[:8]}",
        category="FNR",
        privacy_notice_accepted=True,
        created_at=created_at,
    )
    db.add(v)
    db.flush()
    return v


def test_report_buckets_registrations_by_month(db_session):
    _visitor(db_session, datetime(2026, 1, 10, tzinfo=timezone.utc))
    _visitor(db_session, datetime(2026, 1, 20, tzinfo=timezone.utc))
    _visitor(db_session, datetime(2026, 3, 5, tzinfo=timezone.utc))
    report = build_report(db_session, Granularity.MONTHLY)
    by_period = {r.period: r.visitors_registered for r in report.rows}
    assert by_period["2026-01"] == 2
    assert by_period["2026-03"] == 1


def test_report_respects_date_range(db_session):
    _visitor(db_session, datetime(2025, 12, 31, tzinfo=timezone.utc))
    _visitor(db_session, datetime(2026, 2, 1, tzinfo=timezone.utc))
    report = build_report(
        db_session,
        Granularity.MONTHLY,
        start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end=datetime(2026, 12, 31, tzinfo=timezone.utc),
    )
    periods = {r.period for r in report.rows}
    assert "2026-02" in periods
    assert "2025-12" not in periods


def test_report_to_csv_has_header_and_rows(db_session):
    _visitor(db_session, datetime(2026, 4, 1, tzinfo=timezone.utc))
    report = build_report(db_session, Granularity.MONTHLY)
    text = report_to_csv(report)
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:4] == ["period", "visitors_registered", "entries", "activities"]
    assert any(r[0] == "2026-04" for r in rows[1:])


def test_reports_endpoint_management_only(client, gate_officer_token):
    resp = client.get("/management/reports", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_reports_csv_export_content_type(client, admin_token):
    resp = client.get(
        "/management/reports.csv",
        headers=auth_header(admin_token),
        params={"granularity": "monthly"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]
