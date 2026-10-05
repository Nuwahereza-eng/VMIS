"""Pre-booking / expression-of-interest tests (supervisor priority 2)."""

import uuid
from datetime import date, timedelta

from tests.conftest import auth_header

VISITOR = {
    "full_name": "Booking Arrival",
    "id_number": "BKN-1",
    "nationality": "Testland",
    "category": "EAC",
    "privacy_notice_accepted": True,
}


def _booking_body(**overrides):
    body = {
        "full_name": "Jane Traveller",
        "intended_date": str(date.today() + timedelta(days=5)),
        "country": "Germany",
        "category": "FNR",
        "party_size": 3,
        "expected_gate": "Tangi Gate",
        "length_of_stay_nights": 2,
        "accommodation": "Paraa Lodge",
    }
    body.update(overrides)
    return body


def _create_booking(client, token, **overrides):
    return client.post("/bookings", headers=auth_header(token), json=_booking_body(**overrides))


def test_officer_can_create_booking(client, gate_officer_token):
    resp = _create_booking(client, gate_officer_token)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["full_name"] == "Jane Traveller"
    assert body["status"] == "pending"
    assert body["party_size"] == 3
    assert body["visitor_id"] is None


def test_create_booking_requires_auth(client):
    resp = client.post("/bookings", json=_booking_body())
    assert resp.status_code == 401


def test_booking_requires_intended_date(client, gate_officer_token):
    body = _booking_body()
    del body["intended_date"]
    resp = client.post("/bookings", headers=auth_header(gate_officer_token), json=body)
    assert resp.status_code == 422


def test_list_bookings_filtered_by_date(client, gate_officer_token):
    day = str(date.today() + timedelta(days=10))
    _create_booking(client, gate_officer_token, intended_date=day)
    _create_booking(client, gate_officer_token, intended_date=str(date.today() + timedelta(days=11)))
    resp = client.get(
        "/bookings", headers=auth_header(gate_officer_token), params={"on_date": day}
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    assert rows[0]["intended_date"] == day


def test_list_bookings_filtered_by_status(client, gate_officer_token):
    _create_booking(client, gate_officer_token)
    resp = client.get(
        "/bookings", headers=auth_header(gate_officer_token), params={"booking_status": "pending"}
    )
    assert resp.status_code == 200
    assert all(b["status"] == "pending" for b in resp.json())
    resp2 = client.get(
        "/bookings", headers=auth_header(gate_officer_token), params={"booking_status": "arrived"}
    )
    assert resp2.json() == []


def test_get_missing_booking_returns_404(client, gate_officer_token):
    resp = client.get(f"/bookings/{uuid.uuid4()}", headers=auth_header(gate_officer_token))
    assert resp.status_code == 404


def test_update_booking_fields(client, gate_officer_token):
    booking_id = _create_booking(client, gate_officer_token).json()["id"]
    resp = client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(gate_officer_token),
        json={"party_size": 5, "notes": "Extra guide requested"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["party_size"] == 5
    assert body["notes"] == "Extra guide requested"


def test_linking_booking_to_visitor_marks_arrived(client, gate_officer_token):
    booking_id = _create_booking(client, gate_officer_token).json()["id"]
    visitor_id = client.post(
        "/visitors", headers=auth_header(gate_officer_token), json=VISITOR
    ).json()["visitor"]["id"]
    resp = client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(gate_officer_token),
        json={"visitor_id": visitor_id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "arrived"
    assert body["visitor_id"] == visitor_id
    assert body["arrived_at"] is not None


def test_linking_to_missing_visitor_returns_404(client, gate_officer_token):
    booking_id = _create_booking(client, gate_officer_token).json()["id"]
    resp = client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(gate_officer_token),
        json={"visitor_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404


def test_only_management_can_delete_booking(client, gate_officer_token, admin_token):
    booking_id = _create_booking(client, gate_officer_token).json()["id"]
    forbidden = client.delete(f"/bookings/{booking_id}", headers=auth_header(gate_officer_token))
    assert forbidden.status_code == 403
    ok = client.delete(f"/bookings/{booking_id}", headers=auth_header(admin_token))
    assert ok.status_code == 204
    assert client.get(f"/bookings/{booking_id}", headers=auth_header(admin_token)).status_code == 404


def test_expected_summary_counts_pending_visitors_per_day(client, gate_officer_token):
    day = str(date.today() + timedelta(days=7))
    _create_booking(client, gate_officer_token, intended_date=day, party_size=3)
    _create_booking(client, gate_officer_token, intended_date=day, party_size=2)
    _create_booking(
        client, gate_officer_token, intended_date=str(date.today() + timedelta(days=8)), party_size=4
    )
    resp = client.get("/bookings/expected-summary", headers=auth_header(gate_officer_token))
    assert resp.status_code == 200, resp.text
    rows = {r["intended_date"]: r for r in resp.json()}
    assert rows[day]["bookings"] == 2
    assert rows[day]["expected_visitors"] == 5


def test_expected_summary_excludes_arrived(client, gate_officer_token):
    day = str(date.today() + timedelta(days=9))
    booking_id = _create_booking(client, gate_officer_token, intended_date=day, party_size=3).json()["id"]
    visitor_id = client.post(
        "/visitors", headers=auth_header(gate_officer_token), json=VISITOR
    ).json()["visitor"]["id"]
    client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(gate_officer_token),
        json={"visitor_id": visitor_id},
    )
    resp = client.get("/bookings/expected-summary", headers=auth_header(gate_officer_token))
    rows = {r["intended_date"]: r for r in resp.json()}
    assert day not in rows

