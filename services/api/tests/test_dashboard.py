"""Dashboard endpoint tests (Sprint 6, build prompt section 4.1)."""

from tests.conftest import auth_header


def _register(client, token, id_number, category="FNR"):
    resp = client.post(
        "/visitors",
        headers=auth_header(token),
        json={
            "full_name": "Dash Subject",
            "id_number": id_number,
            "category": category,
            "privacy_notice_accepted": True,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["visitor"]["id"]


def _enter(client, token, visitor_id, ticket, nights=2):
    resp = client.post(
        "/visits",
        headers=auth_header(token),
        json={"visitor_id": visitor_id, "ticket_number": ticket, "nights_purchased": nights},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["visit"]["id"]


def test_dashboard_is_management_only(client, gate_officer_token):
    resp = client.get("/management/dashboard", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_dashboard_counts_inside_now_and_by_gate(client, admin_token, gate_officer_token):
    v1 = _register(client, gate_officer_token, "SYN-D001", "FNR")
    v2 = _register(client, gate_officer_token, "SYN-D002", "EAC")
    _enter(client, gate_officer_token, v1, "TK-D1")
    _enter(client, gate_officer_token, v2, "TK-D2")

    board = client.get("/management/dashboard", headers=auth_header(admin_token)).json()
    assert board["inside_now"] == 2
    gate = next(c for c in board["by_gate"] if c["label"] == "GATE-A")
    assert gate["count"] == 2
    categories = {c["label"]: c["count"] for c in board["by_category"]}
    assert categories["FNR"] == 1
    assert categories["EAC"] == 1


def test_dashboard_revenue_grouped_by_currency(client, admin_token, gate_officer_token, activity_officer_token):
    visitor_id = _register(client, gate_officer_token, "SYN-D003", "FNR")
    catalogue = client.get("/activities", headers=auth_header(activity_officer_token)).json()
    act_id = next(a["id"] for a in catalogue if a["code"] == "day_game_drive")
    client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(activity_officer_token),
        json={"activity_id": act_id, "quantity": 1},
    )
    board = client.get("/management/dashboard", headers=auth_header(admin_token)).json()
    usd = next((r for r in board["revenue"] if r["currency"] == "USD"), None)
    assert usd is not None
    assert usd["amount_minor"] > 0
