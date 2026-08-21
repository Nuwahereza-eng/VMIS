"""Entry/exit and ticket-status endpoint tests (Sprint 3)."""

import uuid
from datetime import datetime, timedelta, timezone

from tests.conftest import auth_header

SYNTHETIC_VISITOR = {
    "full_name": "Visit Tester",
    "id_number": "SYN-2001",
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


def test_gate_officer_records_entry(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = _entry(client, gate_officer_token, visitor_id)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    visit = body["visit"]
    assert visit["is_open"] is True
    assert visit["entry_gate"] == "GATE-A"  # officer's station
    assert visit["ticket"]["status"] == "Active"
    assert visit["ticket"]["remaining_seconds"] > 0
    assert body["duplicate_open_visit"] is False


def test_entry_requires_existing_visitor(client, gate_officer_token):
    resp = _entry(client, gate_officer_token, str(uuid.uuid4()))
    assert resp.status_code == 404


def test_activity_officer_cannot_record_entry(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = _entry(client, activity_officer_token, visitor_id)
    assert resp.status_code == 403


def test_entry_requires_auth(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.post("/visits", json={"visitor_id": visitor_id, "ticket_number": "T", "nights_purchased": 1})
    assert resp.status_code == 401


def test_nights_must_be_at_least_one(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = _entry(client, gate_officer_token, visitor_id, nights_purchased=0)
    assert resp.status_code == 422


def test_client_supplied_entry_id_is_idempotent(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    given = str(uuid.uuid4())
    first = _entry(client, gate_officer_token, visitor_id, id=given)
    assert first.status_code == 201
    replay = _entry(client, gate_officer_token, visitor_id, id=given)
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True


def test_second_open_entry_warns_duplicate(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    assert _entry(client, gate_officer_token, visitor_id).status_code == 201
    second = _entry(client, gate_officer_token, visitor_id)
    assert second.status_code == 201
    assert second.json()["duplicate_open_visit"] is True


def test_exit_matches_open_visit(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    visit_id = _entry(client, gate_officer_token, visitor_id).json()["visit"]["id"]

    resp = client.post(f"/visits/{visit_id}/exit", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_open"] is False
    assert body["exit_gate"] == "GATE-A"
    assert body["exit_timestamp"] is not None


def test_exit_is_idempotent_when_already_closed(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    visit_id = _entry(client, gate_officer_token, visitor_id).json()["visit"]["id"]
    first = client.post(f"/visits/{visit_id}/exit", headers=auth_header(gate_officer_token), json={})
    first_exit = first.json()["exit_timestamp"]
    second = client.post(f"/visits/{visit_id}/exit", headers=auth_header(gate_officer_token), json={})
    assert second.status_code == 200
    assert second.json()["exit_timestamp"] == first_exit


def test_exit_unknown_visit_is_404(client, gate_officer_token):
    resp = client.post(f"/visits/{uuid.uuid4()}/exit", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 404


def test_open_list_shows_inside_visitors(client, gate_officer_token):
    v1 = _register_visitor(client, gate_officer_token)
    visit1 = _entry(client, gate_officer_token, v1).json()["visit"]["id"]

    open_before = client.get("/visits/open", headers=auth_header(gate_officer_token))
    assert open_before.status_code == 200
    assert any(v["id"] == visit1 for v in open_before.json())

    client.post(f"/visits/{visit1}/exit", headers=auth_header(gate_officer_token), json={})
    open_after = client.get("/visits/open", headers=auth_header(gate_officer_token))
    assert not any(v["id"] == visit1 for v in open_after.json())


def test_expired_ticket_status_is_derived(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    # Entry two days in the past with a one-night ticket -> expired now.
    past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    resp = _entry(client, gate_officer_token, visitor_id, nights_purchased=1, entry_timestamp=past)
    assert resp.status_code == 201
    ticket = resp.json()["visit"]["ticket"]
    assert ticket["status"] == "Expired"
    assert ticket["remaining_seconds"] == 0


def test_get_visit_recomputes_status(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    visit_id = _entry(client, gate_officer_token, visitor_id, nights_purchased=3).json()["visit"]["id"]
    resp = client.get(f"/visits/{visit_id}", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    assert resp.json()["ticket"]["status"] == "Active"


def test_activity_officer_can_read_visit(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    visit_id = _entry(client, gate_officer_token, visitor_id).json()["visit"]["id"]
    resp = client.get(f"/visits/{visit_id}", headers=auth_header(activity_officer_token))
    assert resp.status_code == 200
