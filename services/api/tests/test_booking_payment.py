"""Booking payment and digital ticketing (supervisor priority 5/6).

A booking carries the entry fee due (per-category rate x party size). Paying it
is simulated — it always succeeds — but it stores the amount, method, a payment
reference, and mints a unique ticket code that backs the visitor's QR ticket.
Tourists may pay only their own bookings; a booking can't be paid twice.
"""

from tests.conftest import auth_header


def _register(client, email="pat@example.com", password="touristpass123", full_name="Pat Visitor"):
    return client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )


def _book(client, token, **overrides):
    payload = {
        "full_name": "Pat Visitor",
        "intended_date": "2026-12-10",
        "party_size": 2,
        "category": "FNR",
    }
    payload.update(overrides)
    return client.post("/bookings", headers=auth_header(token), json=payload)


def test_booking_quotes_entry_fee_on_create(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token).json()
    # FNR default is 4500 minor (USD 45.00) per person x 2.
    assert booking["amount_minor"] == 9000
    assert booking["currency"] == "USD"
    assert booking["payment_status"] == "unpaid"
    assert booking["ticket_code"] is None


def test_booking_without_category_has_no_quote(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token, category=None).json()
    assert booking["amount_minor"] is None
    assert booking["payment_status"] == "unpaid"


def test_eac_entry_fee_is_in_ugx(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token, category="EAC", party_size=3).json()
    assert booking["currency"] == "UGX"
    assert booking["amount_minor"] == 75000  # 25,000 x 3


def test_pay_marks_paid_and_mints_ticket(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token).json()

    paid = client.post(
        f"/bookings/{booking['id']}/pay",
        headers=auth_header(token),
        json={"method": "mobile_money"},
    )
    assert paid.status_code == 200, paid.text
    body = paid.json()
    assert body["payment_status"] == "paid"
    assert body["payment_method"] == "mobile_money"
    assert body["payment_reference"].startswith("PAY-")
    assert body["ticket_code"].startswith("MF-")
    assert body["paid_at"] is not None
    assert body["amount_minor"] == 9000


def test_cannot_pay_twice(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token).json()

    first = client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={})
    assert first.status_code == 200, first.text

    again = client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={})
    assert again.status_code == 409, again.text


def test_pay_requires_a_category(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token, category=None).json()

    resp = client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={})
    assert resp.status_code == 422, resp.text


def test_tourist_cannot_pay_another_tourists_booking(client):
    alice = _register(client, email="alice@example.com").json()["access_token"]
    bob = _register(client, email="bob@example.com").json()["access_token"]

    booking = _book(client, alice).json()
    denied = client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(bob), json={})
    assert denied.status_code == 403, denied.text


def test_ticket_code_is_unique_across_bookings(client):
    token = _register(client).json()["access_token"]
    codes = set()
    for _ in range(5):
        booking = _book(client, token).json()
        paid = client.post(
            f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={}
        ).json()
        codes.add(paid["ticket_code"])
    assert len(codes) == 5


def test_cancelled_booking_cannot_be_paid(client):
    token = _register(client).json()["access_token"]
    booking = _book(client, token).json()
    client.post(f"/bookings/{booking['id']}/cancel", headers=auth_header(token))

    resp = client.post(f"/bookings/{booking['id']}/pay", headers=auth_header(token), json={})
    assert resp.status_code == 409, resp.text
