"""Cross-gate revenue and visitor reconciliation (supervisor priority 4)."""

from datetime import date

from tests.conftest import auth_header


def _register(client, token, id_number, name="Recon Subject", category="FNR"):
    resp = client.post(
        "/visitors",
        headers=auth_header(token),
        json={
            "full_name": name,
            "id_number": id_number,
            "category": category,
            "privacy_notice_accepted": True,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["visitor"]["id"]


def _enter(client, token, visitor_id, ticket, gate, nights=2):
    resp = client.post(
        "/visits",
        headers=auth_header(token),
        json={
            "visitor_id": visitor_id,
            "ticket_number": ticket,
            "nights_purchased": nights,
            "entry_gate": gate,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["visit"]["id"]


def _exit(client, token, visit_id, gate):
    resp = client.post(
        f"/visits/{visit_id}/exit",
        headers=auth_header(token),
        json={"exit_gate": gate},
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


def _make_prebooked(client, token, visitor_id, gate):
    booking_id = client.post(
        "/bookings",
        headers=auth_header(token),
        json={
            "full_name": "Recon Subject",
            "intended_date": str(date.today()),
            "expected_gate": gate,
            "party_size": 3,
        },
    ).json()["id"]
    resp = client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(token),
        json={"visitor_id": visitor_id},
    )
    assert resp.status_code == 200, resp.text


def test_reconciliation_requires_management(client, gate_officer_token):
    resp = client.get("/management/reconciliation", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_reconciliation_groups_entries_by_gate(client, admin_token):
    v1 = _register(client, admin_token, "REC-1")
    v2 = _register(client, admin_token, "REC-2")
    v3 = _register(client, admin_token, "REC-3")
    _enter(client, admin_token, v1, "T-1", "Tangi Gate")
    _enter(client, admin_token, v2, "T-2", "Tangi Gate")
    _enter(client, admin_token, v3, "T-3", "Wankwar Gate")

    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    gates = {g["gate"]: g for g in data["gates"]}
    assert gates["Tangi Gate"]["entries"] == 2
    assert gates["Wankwar Gate"]["entries"] == 1
    assert data["total_entries"] == 3
    assert data["total_inside"] == 3


def test_reconciliation_tracks_inside_and_exited_per_gate(client, admin_token):
    v1 = _register(client, admin_token, "REC-10")
    v2 = _register(client, admin_token, "REC-11")
    visit1 = _enter(client, admin_token, v1, "E-1", "Tangi Gate")
    _enter(client, admin_token, v2, "E-2", "Tangi Gate")
    _exit(client, admin_token, visit1, "Tangi Gate")

    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    gate = next(g for g in data["gates"] if g["gate"] == "Tangi Gate")
    assert gate["inside_now"] == 1
    assert gate["exited"] == 1
    assert data["total_inside"] == 1
    assert data["total_exited"] == 1


def test_reconciliation_attributes_revenue_to_entry_gate(client, admin_token):
    v1 = _register(client, admin_token, "REC-20")
    v2 = _register(client, admin_token, "REC-21")
    _enter(client, admin_token, v1, "R-1", "Tangi Gate")
    _enter(client, admin_token, v2, "R-2", "Wankwar Gate")
    _book_activity(client, admin_token, v1)
    _book_activity(client, admin_token, v2)

    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    gates = {g["gate"]: g for g in data["gates"]}
    tangi_rev = {t["currency"]: t["amount_minor"] for t in gates["Tangi Gate"]["revenue"]}
    wankwar_rev = {t["currency"]: t["amount_minor"] for t in gates["Wankwar Gate"]["revenue"]}
    assert sum(tangi_rev.values()) > 0
    assert sum(wankwar_rev.values()) > 0
    # Per-gate revenue reconciles back to the grand total.
    grand = {t["currency"]: t["amount_minor"] for t in data["totals"]}
    for cur, amt in grand.items():
        per_gate = sum(
            next((t["amount_minor"] for t in g["revenue"] if t["currency"] == cur), 0)
            for g in data["gates"]
        )
        unassigned = next(
            (t["amount_minor"] for t in data["unassigned_revenue"] if t["currency"] == cur), 0
        )
        assert per_gate + unassigned == amt


def test_reconciliation_revenue_without_visit_is_unassigned(client, admin_token):
    visitor_id = _register(client, admin_token, "REC-30")
    _book_activity(client, admin_token, visitor_id)  # charged but never entered

    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    assert sum(t["amount_minor"] for t in data["unassigned_revenue"]) > 0


def test_reconciliation_shows_expected_from_pending_bookings(client, admin_token):
    client.post(
        "/bookings",
        headers=auth_header(admin_token),
        json={
            "full_name": "Expected Party",
            "intended_date": str(date.today()),
            "expected_gate": "Tangi Gate",
            "party_size": 5,
        },
    )
    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    gate = next(g for g in data["gates"] if g["gate"] == "Tangi Gate")
    assert gate["expected"] == 5
    assert data["total_expected"] == 5


def test_reconciliation_matched_booking_counts_as_prebooked_entry(client, admin_token):
    visitor_id = _register(client, admin_token, "REC-40")
    _make_prebooked(client, admin_token, visitor_id, "Tangi Gate")
    _enter(client, admin_token, visitor_id, "P-1", "Tangi Gate")

    data = client.get("/management/reconciliation", headers=auth_header(admin_token)).json()
    gate = next(g for g in data["gates"] if g["gate"] == "Tangi Gate")
    assert gate["entries"] == 1
    # Matched booking is no longer pending, so it stops showing as expected.
    assert gate["expected"] == 0
