"""Checkpoint scanning + visitor status lifecycle tests (supervisor priority 3)."""

import uuid
from datetime import datetime, timedelta, timezone

from tests.conftest import auth_header

SYNTHETIC_VISITOR = {
    "full_name": "Scan Tester",
    "id_number": "SCN-3001",
    "nationality": "Testland",
    "category": "EAC",
    "privacy_notice_accepted": True,
}


def _register_visitor(client, token):
    resp = client.post("/visitors", headers=auth_header(token), json=SYNTHETIC_VISITOR)
    assert resp.status_code == 201, resp.text
    return resp.json()["visitor"]["id"]


def _entry(client, token, visitor_id, **overrides):
    body = {"visitor_id": visitor_id, "ticket_number": "TKT-1", "nights_purchased": 2, **overrides}
    return client.post("/visits", headers=auth_header(token), json=body)


def _scan(client, token, visitor_id, kind, **overrides):
    body = {"kind": kind, **overrides}
    return client.post(f"/visitors/{visitor_id}/scans", headers=auth_header(token), json=body)


# --- Recording scans -----------------------------------------------------


def test_officer_can_record_entrance_scan(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    _entry(client, gate_officer_token, visitor_id)
    resp = _scan(client, gate_officer_token, visitor_id, "entrance")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["scan"]["kind"] == "entrance"
    assert body["scan"]["location"] == "GATE-A"  # officer's station default
    assert body["scan"]["visit_id"] is not None  # linked to the open visit
    assert body["status"]["status"] == "Inside the park"


def test_scan_location_can_be_overridden(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = _scan(client, activity_officer_token, visitor_id, "checkpoint", location="River Checkpoint")
    assert resp.status_code == 201
    assert resp.json()["scan"]["location"] == "River Checkpoint"


def test_scan_requires_existing_visitor(client, gate_officer_token):
    resp = _scan(client, gate_officer_token, str(uuid.uuid4()), "entrance")
    assert resp.status_code == 404


def test_scan_requires_auth(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.post(f"/visitors/{visitor_id}/scans", json={"kind": "entrance"})
    assert resp.status_code == 401


def test_client_supplied_scan_id_is_idempotent(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    given = str(uuid.uuid4())
    first = _scan(client, gate_officer_token, visitor_id, "entrance", id=given)
    assert first.status_code == 201
    replay = _scan(client, gate_officer_token, visitor_id, "entrance", id=given)
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True
    # Only one scan on record.
    listed = client.get(f"/visitors/{visitor_id}/scans", headers=auth_header(gate_officer_token))
    assert len(listed.json()) == 1


# --- Status derivation ---------------------------------------------------


def test_status_no_ticket_before_any_activity(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.get(f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    assert resp.json()["status"] == "No ticket"


def test_status_inside_after_entry(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    _entry(client, gate_officer_token, visitor_id)
    resp = client.get(f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token))
    assert resp.json()["status"] == "Inside the park"


def test_status_at_checkpoint_after_checkpoint_scan(client, gate_officer_token, activity_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    _entry(client, gate_officer_token, visitor_id)
    _scan(client, activity_officer_token, visitor_id, "checkpoint")
    resp = client.get(f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token))
    assert resp.json()["status"] == "At a checkpoint"


def test_status_exited_after_exit_scan(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    _entry(client, gate_officer_token, visitor_id)
    _scan(client, gate_officer_token, visitor_id, "exit")
    resp = client.get(f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token))
    assert resp.json()["status"] == "Exited"


def test_status_expired_when_ticket_lapsed(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    # Entry three days ago with a 1-night ticket => expired.
    past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    _entry(client, gate_officer_token, visitor_id, nights_purchased=1, entry_timestamp=past)
    resp = client.get(f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token))
    assert resp.json()["status"] == "Ticket expired"


# --- Listing -------------------------------------------------------------


def test_scans_listed_newest_first(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    _entry(client, gate_officer_token, visitor_id)
    _scan(client, gate_officer_token, visitor_id, "entrance", location="Gate")
    _scan(client, gate_officer_token, visitor_id, "checkpoint", location="Mid")
    _scan(client, gate_officer_token, visitor_id, "exit", location="Gate")
    resp = client.get(f"/visitors/{visitor_id}/scans", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    kinds = [s["kind"] for s in resp.json()]
    assert kinds == ["exit", "checkpoint", "entrance"]
