"""RBAC enforcement tests: management-only user administration."""

from tests.conftest import auth_header


def _create_officer(client, admin_token, username="gate1", role="gate_officer", station="GATE-A"):
    return client.post(
        "/users",
        headers=auth_header(admin_token),
        json={
            "username": username,
            "password": "officerpass123",
            "role": role,
            "station_id": station,
        },
    )


def test_management_can_create_user(client, admin_token):
    response = _create_officer(client, admin_token)
    assert response.status_code == 201
    body = response.json()
    assert body["username"] == "gate1"
    assert body["role"] == "gate_officer"
    assert body["station_id"] == "GATE-A"
    assert "password" not in body and "password_hash" not in body


def test_creating_user_requires_authentication(client):
    response = client.post(
        "/users",
        json={"username": "x", "password": "officerpass123", "role": "gate_officer"},
    )
    assert response.status_code == 401


def test_non_management_cannot_create_users(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201

    officer_token = client.post(
        "/auth/token", data={"username": "gate1", "password": "officerpass123"}
    ).json()["access_token"]

    forbidden = client.post(
        "/users",
        headers=auth_header(officer_token),
        json={"username": "gate2", "password": "officerpass123", "role": "gate_officer"},
    )
    assert forbidden.status_code == 403


def test_non_management_cannot_list_users(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    officer_token = client.post(
        "/auth/token", data={"username": "gate1", "password": "officerpass123"}
    ).json()["access_token"]

    assert client.get("/users", headers=auth_header(officer_token)).status_code == 403


def test_duplicate_username_is_rejected(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    assert _create_officer(client, admin_token).status_code == 409
