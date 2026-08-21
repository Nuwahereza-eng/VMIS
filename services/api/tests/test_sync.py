"""Synchronisation tests (build prompt section 9).

These pin the distinguishing guarantees: zero records lost, zero duplicates on
retry, zero identifier collisions across offline stations, and ticket status
after merge matching a fresh computation from entry time. Business-rule conflict
handling (contradictory exit, possible duplicate visitor) is also covered.
"""

import uuid
from datetime import datetime, timedelta, timezone

from tests.conftest import auth_header


def _visitor_op(station, id_number="SYN-9001", full_name="Sync Visitor", category="EAC"):
    vid = str(uuid.uuid4())
    return vid, {
        "op_id": str(uuid.uuid4()),
        "entity_type": "visitor",
        "payload": {
            "id": vid,
            "full_name": full_name,
            "id_number": id_number,
            "category": category,
            "privacy_notice_accepted": True,
            "origin_station_id": station,
        },
    }


def _post_batch(client, token, station, operations):
    return client.post(
        "/sync/batch",
        headers=auth_header(token),
        json={"station_id": station, "operations": operations},
    )


def test_batch_applies_all_records_zero_loss(client, gate_officer_token):
    vid, op = _visitor_op("GATE-A")
    resp = _post_batch(client, gate_officer_token, "GATE-A", [op])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["processed"] == 1
    assert body["applied"] == 1
    # The record is now in the system of record.
    got = client.get(f"/visitors/{vid}", headers=auth_header(gate_officer_token))
    assert got.status_code == 200


def test_replayed_batch_creates_zero_duplicates(client, gate_officer_token):
    vid, op = _visitor_op("GATE-A")
    first = _post_batch(client, gate_officer_token, "GATE-A", [op])
    assert first.json()["applied"] == 1

    # Re-send the exact same op (interrupted/retried upload). Same op_id.
    second = _post_batch(client, gate_officer_token, "GATE-A", [op])
    assert second.status_code == 200
    assert second.json()["applied"] == 0
    assert second.json()["duplicates"] == 1

    # Still exactly one visitor with that id (and no second record).
    assert client.get(f"/visitors/{vid}", headers=auth_header(gate_officer_token)).status_code == 200


def test_same_record_new_op_id_is_idempotent_exists(client, gate_officer_token):
    vid, op = _visitor_op("GATE-A")
    _post_batch(client, gate_officer_token, "GATE-A", [op])

    # Same entity id, different op_id (a genuinely new upload of the same row).
    op2 = {**op, "op_id": str(uuid.uuid4())}
    resp = _post_batch(client, gate_officer_token, "GATE-A", [op2])
    assert resp.json()["results"][0]["result"] == "exists"
    assert resp.json()["applied"] == 0


def test_two_stations_offline_no_identifier_collision(client, gate_officer_token):
    # Two different stations each register a new visitor while offline, then
    # both sync. Distinct station-generated UUIDs => no collision, both stored.
    vid_a, op_a = _visitor_op("GATE-A", id_number="AAA-1", full_name="Alice")
    vid_b, op_b = _visitor_op("GATE-B", id_number="BBB-2", full_name="Bob")
    assert vid_a != vid_b

    _post_batch(client, gate_officer_token, "GATE-A", [op_a])
    _post_batch(client, gate_officer_token, "GATE-B", [op_b])

    assert client.get(f"/visitors/{vid_a}", headers=auth_header(gate_officer_token)).status_code == 200
    assert client.get(f"/visitors/{vid_b}", headers=auth_header(gate_officer_token)).status_code == 200


def test_ticket_status_after_merge_matches_computation(client, gate_officer_token):
    vid, vop = _visitor_op("GATE-A")
    entry_ts = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    visit_id = str(uuid.uuid4())
    visit_op = {
        "op_id": str(uuid.uuid4()),
        "entity_type": "visit",
        "payload": {
            "id": visit_id,
            "visitor_id": vid,
            "entry_gate": "GATE-A",
            "entry_timestamp": entry_ts,
            "ticket_number": "TKT-SYNC",
            "nights_purchased": 1,
        },
    }
    resp = _post_batch(client, gate_officer_token, "GATE-A", [visit_op, vop])
    assert resp.status_code == 200
    assert resp.json()["applied"] == 2  # visitor sorted before visit despite order

    got = client.get(f"/visits/{visit_id}", headers=auth_header(gate_officer_token)).json()
    # One night from an hour ago => still Active, ~23h remaining.
    assert got["ticket"]["status"] == "Active"
    assert 23 * 3600 - 60 < got["ticket"]["remaining_seconds"] <= 23 * 3600


def test_visit_before_visitor_in_batch_is_ordered(client, gate_officer_token):
    # Client sends visit before visitor; engine must reorder so nothing is lost.
    vid, vop = _visitor_op("GATE-A")
    visit_id = str(uuid.uuid4())
    visit_op = {
        "op_id": str(uuid.uuid4()),
        "entity_type": "visit",
        "payload": {
            "id": visit_id,
            "visitor_id": vid,
            "entry_gate": "GATE-A",
            "entry_timestamp": datetime.now(timezone.utc).isoformat(),
            "ticket_number": "TKT-1",
            "nights_purchased": 2,
        },
    }
    resp = _post_batch(client, gate_officer_token, "GATE-A", [visit_op, vop])
    assert resp.json()["conflicts"] == 0
    assert resp.json()["applied"] == 2


def test_visit_with_missing_visitor_becomes_exception_not_lost(client, gate_officer_token, admin_token):
    visit_id = str(uuid.uuid4())
    visit_op = {
        "op_id": str(uuid.uuid4()),
        "entity_type": "visit",
        "payload": {
            "id": visit_id,
            "visitor_id": str(uuid.uuid4()),  # visitor never synced
            "entry_gate": "GATE-A",
            "entry_timestamp": datetime.now(timezone.utc).isoformat(),
            "ticket_number": "TKT-1",
            "nights_purchased": 1,
        },
    }
    resp = _post_batch(client, gate_officer_token, "GATE-A", [visit_op])
    assert resp.json()["conflicts"] == 1
    assert resp.json()["results"][0]["exception_kind"] == "missing_visitor"

    # The data is preserved in the exceptions queue, not silently dropped.
    exc = client.get("/sync/exceptions", headers=auth_header(admin_token)).json()
    assert any(e["entity_id"] == visit_id and e["kind"] == "missing_visitor" for e in exc)


def test_contradictory_exit_goes_to_exceptions(client, gate_officer_token, admin_token):
    vid, vop = _visitor_op("GATE-A")
    visit_id = str(uuid.uuid4())
    entry_ts = datetime.now(timezone.utc).isoformat()
    visit_op = {
        "op_id": str(uuid.uuid4()), "entity_type": "visit",
        "payload": {"id": visit_id, "visitor_id": vid, "entry_gate": "GATE-A",
                    "entry_timestamp": entry_ts, "ticket_number": "T", "nights_purchased": 1},
    }
    _post_batch(client, gate_officer_token, "GATE-A", [vop, visit_op])

    exit_a = datetime.now(timezone.utc).isoformat()
    exit_b = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    op_exit_a = {"op_id": str(uuid.uuid4()), "entity_type": "visit_exit", "entity_id": visit_id,
                 "payload": {"exit_gate": "GATE-A", "exit_timestamp": exit_a}}
    op_exit_b = {"op_id": str(uuid.uuid4()), "entity_type": "visit_exit", "entity_id": visit_id,
                 "payload": {"exit_gate": "GATE-B", "exit_timestamp": exit_b}}

    first = _post_batch(client, gate_officer_token, "GATE-A", [op_exit_a])
    assert first.json()["applied"] == 1

    second = _post_batch(client, gate_officer_token, "GATE-B", [op_exit_b])
    assert second.json()["conflicts"] == 1
    assert second.json()["results"][0]["exception_kind"] == "contradictory_exit"

    # Original exit kept, not overwritten.
    visit = client.get(f"/visits/{visit_id}", headers=auth_header(gate_officer_token)).json()
    assert visit["exit_gate"] == "GATE-A"

    exc = client.get("/sync/exceptions", headers=auth_header(admin_token)).json()
    assert any(e["kind"] == "contradictory_exit" for e in exc)


def test_matching_exit_replay_is_idempotent(client, gate_officer_token):
    vid, vop = _visitor_op("GATE-A")
    visit_id = str(uuid.uuid4())
    visit_op = {
        "op_id": str(uuid.uuid4()), "entity_type": "visit",
        "payload": {"id": visit_id, "visitor_id": vid, "entry_gate": "GATE-A",
                    "entry_timestamp": datetime.now(timezone.utc).isoformat(),
                    "ticket_number": "T", "nights_purchased": 1},
    }
    _post_batch(client, gate_officer_token, "GATE-A", [vop, visit_op])

    exit_ts = datetime.now(timezone.utc).isoformat()
    op_exit = {"op_id": str(uuid.uuid4()), "entity_type": "visit_exit", "entity_id": visit_id,
               "payload": {"exit_gate": "GATE-A", "exit_timestamp": exit_ts}}
    assert _post_batch(client, gate_officer_token, "GATE-A", [op_exit]).json()["applied"] == 1

    # Same exit, new op_id => idempotent "exists", no conflict.
    op_exit2 = {**op_exit, "op_id": str(uuid.uuid4())}
    resp = _post_batch(client, gate_officer_token, "GATE-A", [op_exit2])
    assert resp.json()["conflicts"] == 0
    assert resp.json()["results"][0]["result"] == "exists"


def test_possible_duplicate_visitor_flagged_but_kept(client, gate_officer_token, admin_token):
    # Two stations register the same person as a new visitor (different ids).
    vid_a, op_a = _visitor_op("GATE-A", id_number="DUP-1", full_name="Same Person")
    vid_b, op_b = _visitor_op("GATE-B", id_number="DUP-1", full_name="Same Person")

    _post_batch(client, gate_officer_token, "GATE-A", [op_a])
    resp = _post_batch(client, gate_officer_token, "GATE-B", [op_b])
    assert resp.json()["applied"] == 1
    assert resp.json()["results"][0]["exception_kind"] == "possible_duplicate_visitor"

    # Both records kept (never dropped); supervisor is alerted.
    assert client.get(f"/visitors/{vid_a}", headers=auth_header(gate_officer_token)).status_code == 200
    assert client.get(f"/visitors/{vid_b}", headers=auth_header(gate_officer_token)).status_code == 200
    exc = client.get("/sync/exceptions", headers=auth_header(admin_token)).json()
    assert any(e["kind"] == "possible_duplicate_visitor" for e in exc)


def test_activity_fee_recomputed_server_side_on_merge(client, gate_officer_token, activity_officer_token):
    vid, vop = _visitor_op("GATE-A", category="FNR")
    _post_batch(client, gate_officer_token, "GATE-A", [vop])

    catalogue = client.get("/activities", headers=auth_header(activity_officer_token)).json()
    drive = next(a for a in catalogue if a["code"] == "day_game_drive")
    expected_unit = next(r["amount_minor"] for r in drive["rates"] if r["category"] == "FNR")

    act_id = str(uuid.uuid4())
    op = {
        "op_id": str(uuid.uuid4()), "entity_type": "visitor_activity",
        "payload": {"id": act_id, "visitor_id": vid, "activity_id": drive["id"], "quantity": 2},
    }
    resp = _post_batch(client, gate_officer_token, "GATE-A", [op])
    assert resp.json()["applied"] == 1

    charges = client.get(f"/visitors/{vid}/charges", headers=auth_header(activity_officer_token)).json()
    line = charges["activities"][0]
    # Fee computed by the server from the tariff, not trusted from the client.
    assert line["unit_amount_minor"] == expected_unit
    assert line["amount_minor"] == expected_unit * 2


def test_sync_requires_auth(client):
    assert client.post("/sync/batch", json={"operations": []}).status_code == 401


def test_exceptions_queue_is_management_only(client, gate_officer_token):
    assert client.get("/sync/exceptions", headers=auth_header(gate_officer_token)).status_code == 403
