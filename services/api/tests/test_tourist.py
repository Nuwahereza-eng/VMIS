"""Tourist self-service: public sign-up and own-booking management.

A tourist creates their own account (role fixed server-side), makes bookings,
sees only their own, and can cancel them — but never reaches the park-wide
booking list or management views.
"""

from tests.conftest import auth_header


def _register(client, email="jane@example.com", password="touristpass123", full_name="Jane Doe"):
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
    )
    return resp


def test_register_creates_tourist_and_returns_token(client):
    resp = _register(client)
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]

    me = client.get("/auth/me", headers=auth_header(token))
    assert me.status_code == 200, me.text
    body = me.json()
    assert body["role"] == "tourist"
    assert body["username"] == "jane@example.com"
    assert body["full_name"] == "Jane Doe"


def test_register_normalises_email_and_blocks_duplicates(client):
    first = _register(client, email="Mixed@Example.com")
    assert first.status_code == 201, first.text

    # Same address in different case is the same account.
    dup = _register(client, email="mixed@example.com")
    assert dup.status_code == 409, dup.text


def test_register_rejects_invalid_email(client):
    resp = _register(client, email="not-an-email")
    assert resp.status_code == 422, resp.text


def test_register_cannot_choose_role(client):
    # Even if a client smuggles a role field, it is ignored (schema has none).
    resp = client.post(
        "/auth/register",
        json={
            "email": "sneaky@example.com",
            "password": "touristpass123",
            "full_name": "Sneaky",
            "role": "management",
        },
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["access_token"]
    me = client.get("/auth/me", headers=auth_header(token)).json()
    assert me["role"] == "tourist"


def test_tourist_can_create_and_list_own_bookings(client):
    token = _register(client).json()["access_token"]
    created = client.post(
        "/bookings",
        headers=auth_header(token),
        json={"full_name": "Jane Doe", "intended_date": "2026-12-01", "party_size": 2},
    )
    assert created.status_code == 201, created.text

    mine = client.get("/bookings/mine", headers=auth_header(token))
    assert mine.status_code == 200, mine.text
    rows = mine.json()
    assert len(rows) == 1
    assert rows[0]["party_size"] == 2
    assert rows[0]["status"] == "pending"


def test_mine_is_scoped_to_the_caller(client):
    alice = _register(client, email="alice@example.com").json()["access_token"]
    bob = _register(client, email="bob@example.com").json()["access_token"]

    client.post(
        "/bookings",
        headers=auth_header(alice),
        json={"full_name": "Alice", "intended_date": "2026-12-02"},
    )

    bob_list = client.get("/bookings/mine", headers=auth_header(bob))
    assert bob_list.status_code == 200
    assert bob_list.json() == []


def test_tourist_cannot_read_parkwide_bookings(client):
    token = _register(client).json()["access_token"]
    assert client.get("/bookings", headers=auth_header(token)).status_code == 403
    assert client.get("/bookings/expected-summary", headers=auth_header(token)).status_code == 403


def test_tourist_can_cancel_own_booking(client):
    token = _register(client).json()["access_token"]
    booking = client.post(
        "/bookings",
        headers=auth_header(token),
        json={"full_name": "Jane Doe", "intended_date": "2026-12-03"},
    ).json()

    cancelled = client.post(f"/bookings/{booking['id']}/cancel", headers=auth_header(token))
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"


def test_tourist_cannot_cancel_another_tourists_booking(client):
    alice = _register(client, email="alice@example.com").json()["access_token"]
    bob = _register(client, email="bob@example.com").json()["access_token"]

    booking = client.post(
        "/bookings",
        headers=auth_header(alice),
        json={"full_name": "Alice", "intended_date": "2026-12-04"},
    ).json()

    denied = client.post(f"/bookings/{booking['id']}/cancel", headers=auth_header(bob))
    assert denied.status_code == 403, denied.text
