"""Alerts engine and endpoint tests (Sprint 6, build prompt section 4.1)."""

import uuid
from datetime import timedelta

from app.alerts import AlertKind, compute_alerts
from app.models.base import utcnow
from app.models.visit import Visit
from app.models.visitor import Visitor
from tests.conftest import auth_header


def _visitor(db, category="FNR"):
    v = Visitor(
        id=uuid.uuid4(),
        full_name="Alert Subject",
        id_number=f"SYN-{uuid.uuid4().hex[:8]}",
        category=category,
        privacy_notice_accepted=True,
    )
    db.add(v)
    db.flush()
    return v


def _visit(db, visitor_id, *, entry, nights, gate="GATE-A", exit_ts=None):
    visit = Visit(
        id=uuid.uuid4(),
        visitor_id=visitor_id,
        entry_gate=gate,
        entry_timestamp=entry,
        ticket_number=f"TK-{uuid.uuid4().hex[:6]}",
        nights_purchased=nights,
        exit_timestamp=exit_ts,
    )
    db.add(visit)
    db.flush()
    return visit


def test_ticket_expired_within_grace(db_session):
    now = utcnow()
    v = _visitor(db_session)
    # Expired 2h ago (grace is 6h) -> ticket_expired, not overstay.
    _visit(db_session, v.id, entry=now - timedelta(hours=26), nights=1)
    kinds = {a.kind for a in compute_alerts(db_session, now)}
    assert AlertKind.TICKET_EXPIRED in kinds
    assert AlertKind.OVERSTAY not in kinds


def test_overstay_past_grace(db_session):
    now = utcnow()
    v = _visitor(db_session)
    # Expired 10h ago (> 6h grace) -> overstay.
    _visit(db_session, v.id, entry=now - timedelta(hours=34), nights=1)
    kinds = {a.kind for a in compute_alerts(db_session, now)}
    assert AlertKind.OVERSTAY in kinds
    assert AlertKind.TICKET_EXPIRED not in kinds


def test_missing_exit_flagged_independently(db_session):
    now = utcnow()
    v = _visitor(db_session)
    # Still within the ticket (5 nights) but open for 50h -> missing exit.
    _visit(db_session, v.id, entry=now - timedelta(hours=50), nights=5)
    alerts = compute_alerts(db_session, now)
    kinds = {a.kind for a in alerts}
    assert AlertKind.MISSING_EXIT in kinds
    assert AlertKind.OVERSTAY not in kinds


def test_closed_visit_raises_no_alert(db_session):
    now = utcnow()
    v = _visitor(db_session)
    _visit(
        db_session,
        v.id,
        entry=now - timedelta(hours=100),
        nights=1,
        exit_ts=now - timedelta(hours=90),
    )
    assert compute_alerts(db_session, now) == []


def test_duplicate_entry_flags_both_open_visits(db_session):
    now = utcnow()
    v = _visitor(db_session)
    _visit(db_session, v.id, entry=now - timedelta(hours=1), nights=2)
    _visit(db_session, v.id, entry=now - timedelta(hours=2), nights=2)
    dup = [a for a in compute_alerts(db_session, now) if a.kind == AlertKind.DUPLICATE_ENTRY]
    assert len(dup) == 2


def test_alerts_endpoint_is_management_only(client, gate_officer_token):
    resp = client.get("/management/alerts", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_alerts_endpoint_returns_current_alerts(client, admin_token, db_session):
    v = _visitor(db_session)
    _visit(db_session, v.id, entry=utcnow() - timedelta(hours=34), nights=1)
    db_session.commit()
    resp = client.get("/management/alerts", headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert any(a["kind"] == "overstay" for a in resp.json())
