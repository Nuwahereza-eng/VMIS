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


def _user_id(client, admin_token, username):
    users = client.get("/users", headers=auth_header(admin_token)).json()
    return next(u["id"] for u in users if u["username"] == username)


def test_management_can_update_user(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    user_id = _user_id(client, admin_token, "gate1")

    response = client.patch(
        f"/users/{user_id}",
        headers=auth_header(admin_token),
        json={"full_name": "Gate One", "role": "activity_officer", "station_id": "STATION-2"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Gate One"
    assert body["role"] == "activity_officer"
    assert body["station_id"] == "STATION-2"


def test_management_can_change_user_password(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    user_id = _user_id(client, admin_token, "gate1")

    response = client.patch(
        f"/users/{user_id}",
        headers=auth_header(admin_token),
        json={"password": "newpassword123"},
    )
    assert response.status_code == 200

    assert client.post(
        "/auth/token", data={"username": "gate1", "password": "newpassword123"}
    ).status_code == 200


def test_update_username_clash_is_rejected(client, admin_token):
    assert _create_officer(client, admin_token, username="gate1").status_code == 201
    assert _create_officer(client, admin_token, username="gate2").status_code == 201
    user_id = _user_id(client, admin_token, "gate2")

    response = client.patch(
        f"/users/{user_id}",
        headers=auth_header(admin_token),
        json={"username": "gate1"},
    )
    assert response.status_code == 409


def test_management_can_delete_user(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    user_id = _user_id(client, admin_token, "gate1")

    response = client.delete(f"/users/{user_id}", headers=auth_header(admin_token))
    assert response.status_code == 204

    users = client.get("/users", headers=auth_header(admin_token)).json()
    assert all(u["username"] != "gate1" for u in users)


def test_admin_cannot_delete_own_account(client, admin_token):
    admin_id = _user_id(client, admin_token, "admin")
    response = client.delete(f"/users/{admin_id}", headers=auth_header(admin_token))
    assert response.status_code == 400


def test_admin_cannot_deactivate_own_account(client, admin_token):
    admin_id = _user_id(client, admin_token, "admin")
    response = client.patch(
        f"/users/{admin_id}",
        headers=auth_header(admin_token),
        json={"is_active": False},
    )
    assert response.status_code == 400


def test_admin_cannot_demote_own_role(client, admin_token):
    admin_id = _user_id(client, admin_token, "admin")
    response = client.patch(
        f"/users/{admin_id}",
        headers=auth_header(admin_token),
        json={"role": "gate_officer"},
    )
    assert response.status_code == 400


def test_non_management_cannot_update_or_delete_users(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    user_id = _user_id(client, admin_token, "gate1")
    officer_token = client.post(
        "/auth/token", data={"username": "gate1", "password": "officerpass123"}
    ).json()["access_token"]

    assert client.patch(
        f"/users/{user_id}",
        headers=auth_header(officer_token),
        json={"full_name": "x"},
    ).status_code == 403
    assert client.delete(
        f"/users/{user_id}", headers=auth_header(officer_token)
    ).status_code == 403


def test_update_and_delete_require_authentication(client, admin_token):
    assert _create_officer(client, admin_token).status_code == 201
    user_id = _user_id(client, admin_token, "gate1")

    assert client.patch(f"/users/{user_id}", json={"full_name": "x"}).status_code == 401
    assert client.delete(f"/users/{user_id}").status_code == 401
