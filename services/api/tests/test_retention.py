"""PII retention enforcement tests (Sprint 6, build prompt section 8)."""

import uuid
from datetime import timedelta

from app.config import get_settings
from app.models.base import utcnow
from app.models.visitor import Visitor
from app.retention import REDACTED, enforce_retention
from tests.conftest import auth_header


def _visitor(db, created_at):
    v = Visitor(
        id=uuid.uuid4(),
        full_name="Retention Subject",
        id_number=f"SYN-{uuid.uuid4().hex[:8]}",
        nationality="Testland",
        category="FNR",
        privacy_notice_accepted=True,
        created_at=created_at,
    )
    db.add(v)
    db.flush()
    return v


def test_old_visitor_pii_redacted(db_session):
    days = get_settings().pii_retention_days
    old = _visitor(db_session, utcnow() - timedelta(days=days + 5))
    result = enforce_retention(db_session)
    assert result.redacted == 1
    db_session.refresh(old)
    assert old.pii_redacted is True
    assert old.full_name == REDACTED
    assert old.id_number == REDACTED
    assert old.nationality is None


def test_recent_visitor_not_redacted(db_session):
    fresh = _visitor(db_session, utcnow() - timedelta(days=1))
    result = enforce_retention(db_session)
    assert result.redacted == 0
    db_session.refresh(fresh)
    assert fresh.pii_redacted is False
    assert fresh.full_name != REDACTED


def test_retention_is_idempotent(db_session):
    days = get_settings().pii_retention_days
    _visitor(db_session, utcnow() - timedelta(days=days + 5))
    first = enforce_retention(db_session)
    second = enforce_retention(db_session)
    assert first.redacted == 1
    assert second.redacted == 0


def test_retention_endpoint_management_only(client, gate_officer_token):
    resp = client.post("/management/retention/enforce", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_retention_endpoint_reports_count(client, admin_token, db_session):
    days = get_settings().pii_retention_days
    _visitor(db_session, utcnow() - timedelta(days=days + 5))
    db_session.commit()
    resp = client.post("/management/retention/enforce", headers=auth_header(admin_token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["redacted"] >= 1
    assert body["retention_days"] == days
