"""Tourist visit lifecycle after payment: booked -> paid -> touring -> completed.

A gate officer checks a paid ticket in by its code (the tour starts and the
validity window opens), and checks it out on exit. The stage, expiry, and
remaining time are derived on every read, never stored.
"""

from datetime import datetime, timedelta, timezone

from app.booking_lifecycle import compute_lifecycle
from app.models.enums import BookingLifecycle, BookingStatus, PaymentStatus
from tests.conftest import auth_header


def _tourist(client):
    return client.post(
        "/auth/register",
        json={"email": "lee@example.com", "password": "touristpass123", "full_name": "Lee"},
    ).json()["access_token"]


def _paid_booking(client, token, **overrides):
    payload = {"full_name": "Lee", "intended_date": "2026-12-10", "category": "FNR"}
    payload.update(overrides)
    booking = client.post("/bookings", headers=auth_header(token), json=payload).json()
    return client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={}).json()


def test_stages_before_check_in(client):
    token = _tourist(client)
    unpaid = client.post(
        "/bookings",
        headers=auth_header(token),
        json={"full_name": "Lee", "intended_date": "2026-12-10", "category": "FNR"},
    ).json()
    assert unpaid["lifecycle"] == "booked"
    assert unpaid["ticket_expires_at"] is None

    paid = _paid_booking(client, token)
    assert paid["lifecycle"] == "paid"


def test_check_in_starts_tour_and_shows_on_mine(client, gate_officer_token):
    token = _tourist(client)
    paid = _paid_booking(client, token, length_of_stay_nights=2)

    # Scanned codes may come in lower case.
    resp = client.post(
        f"/bookings/ticket/{paid['ticket_code'].lower()}/check-in",
        headers=auth_header(gate_officer_token),
        json={"gate": "Tangi Gate"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "arrived"
    assert body["lifecycle"] == "touring"
    assert body["entry_gate"] == "Tangi Gate"
    assert body["arrived_at"] is not None
    # 2 nights = 48h window, just opened.
    assert 47 * 3600 < body["ticket_remaining_seconds"] <= 48 * 3600

    mine = client.get("/bookings/mine", headers=auth_header(token)).json()
    assert mine[0]["lifecycle"] == "touring"


def test_check_in_defaults_gate_to_officer_station(client, gate_officer_token):
    token = _tourist(client)
    paid = _paid_booking(client, token)
    body = client.post(
        f"/bookings/ticket/{paid['ticket_code']}/check-in",
        headers=auth_header(gate_officer_token),
        json={},
    ).json()
    assert body["entry_gate"] == "GATE-A"


def test_double_check_in_is_rejected(client, gate_officer_token):
    token = _tourist(client)
    code = _paid_booking(client, token)["ticket_code"]
    url = f"/bookings/ticket/{code}/check-in"
    assert client.post(url, headers=auth_header(gate_officer_token), json={}).status_code == 200
    again = client.post(url, headers=auth_header(gate_officer_token), json={})
    assert again.status_code == 409
    assert "Already checked in" in again.json()["detail"]


def test_check_out_completes_visit(client, gate_officer_token):
    token = _tourist(client)
    code = _paid_booking(client, token)["ticket_code"]
    headers = auth_header(gate_officer_token)

    early = client.post(f"/bookings/ticket/{code}/check-out", headers=headers, json={})
    assert early.status_code == 409

    client.post(f"/bookings/ticket/{code}/check-in", headers=headers, json={})
    done = client.post(f"/bookings/ticket/{code}/check-out", headers=headers, json={})
    assert done.status_code == 200, done.text
    assert done.json()["lifecycle"] == "completed"
    assert done.json()["departed_at"] is not None

    reuse = client.post(f"/bookings/ticket/{code}/check-in", headers=headers, json={})
    assert reuse.status_code == 409


def test_cancelled_ticket_cannot_check_in(client, gate_officer_token):
    token = _tourist(client)
    paid = _paid_booking(client, token)
    client.post(f"/bookings/{paid['id']}/cancel", headers=auth_header(token))
    resp = client.post(
        f"/bookings/ticket/{paid['ticket_code']}/check-in",
        headers=auth_header(gate_officer_token),
        json={},
    )
    assert resp.status_code == 409


def test_tourist_cannot_check_in_or_look_up(client):
    token = _tourist(client)
    code = _paid_booking(client, token)["ticket_code"]
    headers = auth_header(token)
    assert client.post(f"/bookings/ticket/{code}/check-in", headers=headers, json={}).status_code == 403
    assert client.get(f"/bookings/ticket/{code}", headers=headers).status_code == 403


def test_unknown_ticket_is_404(client, gate_officer_token):
    resp = client.get("/bookings/ticket/MF-NOPE", headers=auth_header(gate_officer_token))
    assert resp.status_code == 404


def test_lookup_by_ticket(client, gate_officer_token):
    token = _tourist(client)
    paid = _paid_booking(client, token)
    resp = client.get(
        f"/bookings/ticket/{paid['ticket_code']}", headers=auth_header(gate_officer_token)
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == paid["id"]


def test_marking_arrived_by_hand_starts_window(client, gate_officer_token):
    token = _tourist(client)
    paid = _paid_booking(client, token)
    body = client.patch(
        f"/bookings/{paid['id']}",
        headers=auth_header(gate_officer_token),
        json={"status": "arrived"},
    ).json()
    assert body["arrived_at"] is not None
    assert body["lifecycle"] == "touring"


def test_lifecycle_expires_after_window():
    entry = datetime(2026, 12, 10, 8, 0, tzinfo=timezone.utc)
    args = (BookingStatus.ARRIVED, PaymentStatus.PAID, entry, None, 1)

    inside = compute_lifecycle(*args, now=entry + timedelta(hours=23))
    assert inside.stage == BookingLifecycle.TOURING
    assert inside.ticket_remaining_seconds == 3600

    after = compute_lifecycle(*args, now=entry + timedelta(hours=24))
    assert after.stage == BookingLifecycle.EXPIRED
    assert after.ticket_remaining_seconds == 0


def test_lifecycle_terminal_states():
    entry = datetime(2026, 12, 10, 8, 0, tzinfo=timezone.utc)
    done = compute_lifecycle(
        BookingStatus.ARRIVED, PaymentStatus.PAID, entry, entry + timedelta(hours=5), 1
    )
    assert done.stage == BookingLifecycle.COMPLETED
    assert compute_lifecycle(BookingStatus.CANCELLED, PaymentStatus.PAID, None, None, 1).stage == (
        BookingLifecycle.CANCELLED
    )
    assert compute_lifecycle(BookingStatus.NO_SHOW, PaymentStatus.UNPAID, None, None, 1).stage == (
        BookingLifecycle.NO_SHOW
    )
