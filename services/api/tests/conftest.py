"""Test fixtures.

A file-backed SQLite database is used so the schema survives across the
connections the TestClient opens. The schema is reset before every test for
isolation, and the app lifespan re-seeds the bootstrap management account.
"""

import os
import tempfile

# Environment must be set before importing anything that reads settings.
os.environ.setdefault("VMIS_SECRET_KEY", "test-secret-key-not-for-production")
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["VMIS_DATABASE_URL"] = f"sqlite+pysqlite:///{_db_path}"
os.environ["VMIS_BOOTSTRAP_ADMIN_USERNAME"] = "admin"
os.environ["VMIS_BOOTSTRAP_ADMIN_PASSWORD"] = "adminpassword123"

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal, engine
from app.main import app
from app.models import Base

BOOTSTRAP_ADMIN = {"username": "admin", "password": "adminpassword123"}


@pytest.fixture(autouse=True)
def _reset_schema():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    # Entering the context manager runs the app lifespan (create_all + bootstrap).
    with TestClient(app) as test_client:
        yield test_client


def _token(client: TestClient, username: str, password: str) -> str:
    response = client.post("/auth/token", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
def admin_token(client):
    return _token(client, **BOOTSTRAP_ADMIN)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_officer_token(client, admin_token, username, role, station):
    resp = client.post(
        "/users",
        headers=auth_header(admin_token),
        json={
            "username": username,
            "password": "officerpass123",
            "role": role,
            "station_id": station,
        },
    )
    assert resp.status_code == 201, resp.text
    return _token(client, username, "officerpass123")


@pytest.fixture
def gate_officer_token(client, admin_token):
    return _make_officer_token(client, admin_token, "gate1", "gate_officer", "GATE-A")


@pytest.fixture
def activity_officer_token(client, admin_token):
    return _make_officer_token(client, admin_token, "act1", "activity_officer", "STATION-1")
