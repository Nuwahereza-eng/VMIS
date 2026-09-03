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


def test_management_can_list_visitor_registry(client, gate_officer_token, admin_token):
    a = _register(client, gate_officer_token, id_number="REG-1", full_name="Alice R").json()
    _register(client, gate_officer_token, id_number="REG-2", full_name="Bob R")

    resp = client.get("/visitors", headers=auth_header(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] >= 2
    ids = {item["id"] for item in body["items"]}
    assert a["visitor"]["id"] in ids
    # New records carry derived registry fields.
    sample = next(i for i in body["items"] if i["id"] == a["visitor"]["id"])
    assert sample["is_inside"] is False
    assert sample["visit_count"] == 0


def test_registry_search_matches_name_and_id(client, gate_officer_token, admin_token):
    _register(client, gate_officer_token, id_number="SEARCH-XYZ", full_name="Zawadi Q")

    by_name = client.get("/visitors", params={"search": "zawadi"}, headers=auth_header(admin_token))
    assert by_name.status_code == 200
    assert any(i["full_name"] == "Zawadi Q" for i in by_name.json()["items"])

    by_id = client.get("/visitors", params={"search": "SEARCH-XYZ"}, headers=auth_header(admin_token))
    assert any(i["id_number"] == "SEARCH-XYZ" for i in by_id.json()["items"])


def test_registry_pagination_limits_rows(client, gate_officer_token, admin_token):
    for i in range(3):
        _register(client, gate_officer_token, id_number=f"PAGE-{i}", full_name=f"Pager {i}")
    resp = client.get("/visitors", params={"limit": 2}, headers=auth_header(admin_token))
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 2
    assert resp.json()["total"] >= 3


def test_registry_reports_inside_status(client, gate_officer_token, admin_token):
    visitor = _register(client, gate_officer_token, id_number="INSIDE-1", full_name="Inside One").json()["visitor"]
    entry = client.post(
        "/visits",
        headers=auth_header(gate_officer_token),
        json={"visitor_id": visitor["id"], "ticket_number": "TK-INSIDE", "nights_purchased": 1},
    )
    assert entry.status_code == 201, entry.text

    resp = client.get("/visitors", params={"search": "INSIDE-1"}, headers=auth_header(admin_token))
    item = next(i for i in resp.json()["items"] if i["id"] == visitor["id"])
    assert item["is_inside"] is True
    assert item["visit_count"] == 1


def test_officer_cannot_list_visitor_registry(client, gate_officer_token, activity_officer_token):
    assert client.get("/visitors", headers=auth_header(gate_officer_token)).status_code == 403
    assert client.get("/visitors", headers=auth_header(activity_officer_token)).status_code == 403


def test_officer_can_lookup_visitors_to_serve(client, gate_officer_token, activity_officer_token):
    # A gate officer registers; an activity officer must be able to find them.
    registered = _register(
        client, gate_officer_token, id_number="LOOKUP-1", full_name="Serve Me"
    ).json()["visitor"]

    resp = client.get(
        "/visitors/lookup", params={"search": "serve"}, headers=auth_header(activity_officer_token)
    )
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    match = next(i for i in items if i["id"] == registered["id"])
    assert match["full_name"] == "Serve Me"
    assert match["id_number"] == "LOOKUP-1"
    assert match["category"] == registered["category"]
    # Minimal projection: no extended contact PII is exposed to officers.
    assert "phone" not in match
    assert "email" not in match


def test_lookup_requires_auth(client):
    assert client.get("/visitors/lookup").status_code == 401


def test_registry_requires_auth(client):
    assert client.get("/visitors").status_code == 401



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
