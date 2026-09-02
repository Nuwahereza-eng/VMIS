"""Activity capture, accommodation, and charges endpoint tests (Sprint 4)."""

import uuid

from tests.conftest import auth_header


def _register_visitor(client, token, category="FNR"):
    resp = client.post(
        "/visitors",
        headers=auth_header(token),
        json={
            "full_name": "Charge Tester",
            "id_number": "SYN-3001",
            "category": category,
            "privacy_notice_accepted": True,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["visitor"]["id"]


def _activity_id(client, token, code):
    catalogue = client.get("/activities", headers=auth_header(token)).json()
    return next(a["id"] for a in catalogue if a["code"] == code)


def test_catalogue_lists_seeded_activities(client, gate_officer_token):
    resp = client.get("/activities", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    codes = {a["code"] for a in resp.json()}
    assert "park_entrance" in codes
    assert "wildlife_clubs" in codes
    clubs = next(a for a in resp.json() if a["code"] == "wildlife_clubs")
    assert clubs["is_free"] is True
    assert clubs["rates"] == []


def test_catalogue_requires_auth(client):
    assert client.get("/activities").status_code == 401


def test_activity_officer_can_add_activity_with_computed_fee(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token, category="FNR")
    act_id = _activity_id(client, activity_officer_token, "day_game_drive")

    resp = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"activity_id": act_id, "quantity": 2},
    )
    assert resp.status_code == 201, resp.text
    line = resp.json()["activity"]
    assert line["currency"] == "USD"
    assert line["quantity"] == 2
    assert line["amount_minor"] == line["unit_amount_minor"] * 2
    assert isinstance(line["amount_minor"], int)


def test_gate_officer_cannot_capture_activity(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    act_id = _activity_id(client, gate_officer_token, "park_entrance")
    resp = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(gate_officer_token),
        json={"activity_id": act_id},
    )
    assert resp.status_code == 403


def test_free_activity_charges_zero(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token, category="EAC")
    act_id = _activity_id(client, activity_officer_token, "wildlife_clubs")
    resp = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"activity_id": act_id},
    )
    assert resp.status_code == 201
    line = resp.json()["activity"]
    assert line["amount_minor"] == 0
    assert line["currency"] == "UGX"


def test_add_activity_to_unknown_visitor_is_404(client, activity_officer_token):
    act_id = _activity_id(client, activity_officer_token, "park_entrance")
    resp = client.post(
        f"/visitors/{uuid.uuid4()}/activities",
        headers=auth_header(activity_officer_token),
        json={"activity_id": act_id},
    )
    assert resp.status_code == 404


def test_unknown_activity_is_404(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"activity_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404


def test_activity_add_is_idempotent(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    act_id = _activity_id(client, activity_officer_token, "cycling")
    given = str(uuid.uuid4())
    first = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"id": given, "activity_id": act_id},
    )
    assert first.status_code == 201
    replay = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"id": given, "activity_id": act_id},
    )
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True


def test_multiple_activities_per_visitor(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    for code in ("park_entrance", "cycling"):
        act_id = _activity_id(client, activity_officer_token, code)
        assert client.post(
            f"/visitors/{visitor_id}/activities",
            headers=auth_header(activity_officer_token),
            json={"activity_id": act_id},
        ).status_code == 201
    listed = client.get(
        f"/visitors/{visitor_id}/activities", headers=auth_header(activity_officer_token)
    )
    assert len(listed.json()) == 2


def test_accommodation_capture(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.post(
        f"/visitors/{visitor_id}/accommodations",
        headers=auth_header(gate_officer_token),
        json={"facility": "Paraa Lodge", "nights": 3},
    )
    assert resp.status_code == 201
    acc = resp.json()["accommodation"]
    assert acc["facility"] == "Paraa Lodge"
    assert acc["nights"] == 3


def test_accommodation_is_idempotent(client, activity_officer_token, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    given = str(uuid.uuid4())
    body = {"id": given, "facility": "Red Chilli", "nights": 1}
    first = client.post(
        f"/visitors/{visitor_id}/accommodations", headers=auth_header(gate_officer_token), json=body
    )
    assert first.status_code == 201
    replay = client.post(
        f"/visitors/{visitor_id}/accommodations", headers=auth_header(gate_officer_token), json=body
    )
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True


def test_charges_summary_totals_per_currency(client, activity_officer_token, gate_officer_token):
    # EAC visitor -> UGX activities only. Totals should be a single UGX line.
    visitor_id = _register_visitor(client, gate_officer_token, category="EAC")
    for code, qty in (("park_entrance", 1), ("day_game_drive", 2)):
        act_id = _activity_id(client, activity_officer_token, code)
        client.post(
            f"/visitors/{visitor_id}/activities",
            headers=auth_header(activity_officer_token),
            json={"activity_id": act_id, "quantity": qty},
        )
    client.post(
        f"/visitors/{visitor_id}/accommodations",
        headers=auth_header(gate_officer_token),
        json={"facility": "Paraa", "nights": 2},
    )

    summary = client.get(
        f"/visitors/{visitor_id}/charges", headers=auth_header(activity_officer_token)
    ).json()
    assert len(summary["activities"]) == 2
    assert len(summary["accommodations"]) == 1
    assert len(summary["totals"]) == 1
    total = summary["totals"][0]
    assert total["currency"] == "UGX"
    expected = sum(a["amount_minor"] for a in summary["activities"])
    assert total["amount_minor"] == expected


def test_gate_officer_can_read_charges(client, gate_officer_token):
    visitor_id = _register_visitor(client, gate_officer_token)
    resp = client.get(f"/visitors/{visitor_id}/charges", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200
    assert resp.json()["totals"] == []
