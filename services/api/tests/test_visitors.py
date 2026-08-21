"""Visitor registration and identification endpoint tests (Sprint 2)."""

import uuid

from tests.conftest import auth_header

SYNTHETIC = {
    "full_name": "Synthetic Visitor",
    "id_number": "SYN-1001",
    "nationality": "Testland",
    "category": "FNR",
    "privacy_notice_accepted": True,
}


def _register(client, token, **overrides):
    body = {**SYNTHETIC, **overrides}
    return client.post("/visitors", headers=auth_header(token), json=body)


def test_gate_officer_can_register(client, gate_officer_token):
    resp = _register(client, gate_officer_token)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["visitor"]["full_name"] == "Synthetic Visitor"
    assert body["visitor"]["category"] == "FNR"
    # Station defaults to the officer's station when not supplied.
    assert body["visitor"]["origin_station_id"] == "GATE-A"
    assert body["idempotent"] is False
    assert body["duplicate_warning"] == []


def test_registration_requires_privacy_notice(client, gate_officer_token):
    resp = _register(client, gate_officer_token, privacy_notice_accepted=False)
    assert resp.status_code == 422


def test_activity_officer_cannot_register(client, activity_officer_token):
    assert _register(client, activity_officer_token).status_code == 403


def test_registration_requires_auth(client):
    resp = client.post("/visitors", json=SYNTHETIC)
    assert resp.status_code == 401


def test_duplicate_id_and_name_warns_but_still_registers(client, gate_officer_token):
    first = _register(client, gate_officer_token)
    assert first.status_code == 201

    second = _register(client, gate_officer_token)
    assert second.status_code == 201
    warnings = second.json()["duplicate_warning"]
    assert len(warnings) == 1
    assert warnings[0]["id_number"] == "SYN-1001"


def test_client_supplied_id_is_idempotent(client, gate_officer_token):
    given = str(uuid.uuid4())
    first = _register(client, gate_officer_token, id=given)
    assert first.status_code == 201
    assert first.json()["visitor"]["id"] == given

    # Replaying the same offline write must not create a duplicate.
    replay = _register(client, gate_officer_token, id=given)
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True
    assert replay.json()["duplicate_warning"] == []


def test_get_visitor_by_id(client, gate_officer_token):
    created = _register(client, gate_officer_token).json()["visitor"]
    resp = client.get(f"/visitors/{created['id']}", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_unknown_visitor_is_404(client, gate_officer_token):
    resp = client.get(f"/visitors/{uuid.uuid4()}", headers=auth_header(gate_officer_token))
    assert resp.status_code == 404


def test_qr_endpoint_returns_png(client, gate_officer_token):
    created = _register(client, gate_officer_token).json()["visitor"]
    resp = client.get(f"/visitors/{created['id']}/qr", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert resp.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_verify_resolves_scanned_payload(client, gate_officer_token):
    created = _register(client, gate_officer_token).json()["visitor"]
    payload = f"VMIS:1:{created['id']}"
    resp = client.post(
        "/visitors/verify", headers=auth_header(gate_officer_token), json={"payload": payload}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["found"] is True
    assert body["visitor"]["id"] == created["id"]


def test_verify_unknown_identifier_returns_not_found(client, gate_officer_token):
    payload = f"VMIS:1:{uuid.uuid4()}"
    resp = client.post(
        "/visitors/verify", headers=auth_header(gate_officer_token), json={"payload": payload}
    )
    assert resp.status_code == 200
    assert resp.json()["found"] is False


def test_verify_malformed_payload_returns_not_found(client, gate_officer_token):
    resp = client.post(
        "/visitors/verify", headers=auth_header(gate_officer_token), json={"payload": "garbage"}
    )
    assert resp.status_code == 200
    assert resp.json()["found"] is False


def test_activity_officer_can_verify(client, activity_officer_token, gate_officer_token):
    created = _register(client, gate_officer_token).json()["visitor"]
    resp = client.post(
        "/visitors/verify",
        headers=auth_header(activity_officer_token),
        json={"payload": f"VMIS:1:{created['id']}"},
    )
    assert resp.status_code == 200
    assert resp.json()["found"] is True
