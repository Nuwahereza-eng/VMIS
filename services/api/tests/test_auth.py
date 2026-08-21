"""Authentication endpoint tests."""

from tests.conftest import BOOTSTRAP_ADMIN, auth_header


def test_health_is_open(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_login_succeeds_for_bootstrap_admin(client):
    response = client.post("/auth/token", data=BOOTSTRAP_ADMIN)
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_rejects_wrong_password(client):
    response = client.post(
        "/auth/token", data={"username": "admin", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_rejects_unknown_user(client):
    response = client.post(
        "/auth/token", data={"username": "ghost", "password": "whatever123"}
    )
    assert response.status_code == 401


def test_me_requires_a_token(client):
    assert client.get("/auth/me").status_code == 401


def test_me_returns_current_user(client, admin_token):
    response = client.get("/auth/me", headers=auth_header(admin_token))
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "admin"
    assert body["role"] == "management"


def test_me_rejects_garbage_token(client):
    response = client.get("/auth/me", headers=auth_header("not.a.jwt"))
    assert response.status_code == 401
