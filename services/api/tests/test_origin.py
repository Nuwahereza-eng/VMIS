"""Walk-in vs pre-booked distinction in statistics and revenue (priority 4)."""

from datetime import date

from tests.conftest import auth_header


def _register(client, token, id_number, category="FNR"):
    resp = client.post(
        "/visitors",
        headers=auth_header(token),
        json={
            "full_name": "Origin Subject",
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


def _make_prebooked(client, token, visitor_id):
    """Create a booking and match it to the visitor (marks them pre-booked)."""
    booking_id = client.post(
        "/bookings",
        headers=auth_header(token),
        json={"full_name": "Origin Subject", "intended_date": str(date.today())},
    ).json()["id"]
    resp = client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(token),
        json={"visitor_id": visitor_id},
    )
    assert resp.status_code == 200, resp.text


def _book_activity(client, token, visitor_id):
    catalogue = client.get("/activities", headers=auth_header(token)).json()
    act_id = next(a["id"] for a in catalogue if a["code"] == "day_game_drive")
    resp = client.post(
        f"/visitors/{visitor_id}/activities",
        headers=auth_header(token),
        json={"activity_id": act_id, "quantity": 1},
    )
    assert resp.status_code in (200, 201), resp.text


def test_visitor_status_reports_walk_in_by_default(client, gate_officer_token):
    visitor_id = _register(client, gate_officer_token, "ORG-1")
    _enter(client, gate_officer_token, visitor_id, "TK-O1")
    status = client.get(
        f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token)
    ).json()
    assert status["origin"] == "walk_in"


def test_visitor_status_reports_pre_booked_when_matched(client, gate_officer_token):
    visitor_id = _register(client, gate_officer_token, "ORG-2")
    _make_prebooked(client, gate_officer_token, visitor_id)
    status = client.get(
        f"/visitors/{visitor_id}/status", headers=auth_header(gate_officer_token)
    ).json()
    assert status["origin"] == "pre_booked"


def test_dashboard_splits_inside_by_origin(client, admin_token, gate_officer_token):
    walk = _register(client, gate_officer_token, "ORG-3")
    booked = _register(client, gate_officer_token, "ORG-4")
    _enter(client, gate_officer_token, walk, "TK-O3")
    _enter(client, gate_officer_token, booked, "TK-O4")
    _make_prebooked(client, gate_officer_token, booked)

    board = client.get("/management/dashboard", headers=auth_header(admin_token)).json()
    by_origin = {c["label"]: c["count"] for c in board["by_origin"]}
    assert by_origin["Walk-in"] == 1
    assert by_origin["Pre-booked"] == 1


def test_dashboard_revenue_split_by_origin(
    client, admin_token, gate_officer_token, activity_officer_token
):
    walk = _register(client, gate_officer_token, "ORG-5")
    booked = _register(client, gate_officer_token, "ORG-6")
    _make_prebooked(client, gate_officer_token, booked)
    _book_activity(client, activity_officer_token, walk)
    _book_activity(client, activity_officer_token, booked)

    board = client.get("/management/dashboard", headers=auth_header(admin_token)).json()
    by_origin = {o["origin"]: o["totals"] for o in board["revenue_by_origin"]}
    pre_usd = next((t for t in by_origin["Pre-booked"] if t["currency"] == "USD"), None)
    walk_usd = next((t for t in by_origin["Walk-in"] if t["currency"] == "USD"), None)
    assert pre_usd is not None and pre_usd["amount_minor"] > 0
    assert walk_usd is not None and walk_usd["amount_minor"] > 0


def test_report_counts_entries_by_origin(client, admin_token, gate_officer_token):
    walk = _register(client, gate_officer_token, "ORG-7")
    booked = _register(client, gate_officer_token, "ORG-8")
    _enter(client, gate_officer_token, walk, "TK-O7")
    _enter(client, gate_officer_token, booked, "TK-O8")
    _make_prebooked(client, gate_officer_token, booked)

    report = client.get(
        "/management/reports", headers=auth_header(admin_token), params={"granularity": "annual"}
    ).json()
    totals_pre = sum(r["pre_booked"] for r in report["rows"])
    totals_walk = sum(r["walk_in"] for r in report["rows"])
    assert totals_pre == 1
    assert totals_walk == 1


def test_report_csv_has_origin_columns(client, admin_token, gate_officer_token):
    visitor_id = _register(client, gate_officer_token, "ORG-9")
    _enter(client, gate_officer_token, visitor_id, "TK-O9")
    resp = client.get(
        "/management/reports.csv", headers=auth_header(admin_token), params={"granularity": "annual"}
    )
    assert resp.status_code == 200
    header = resp.text.splitlines()[0]
    assert "pre_booked" in header
    assert "walk_in" in header
