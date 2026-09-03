"""Tests for management configuration: activities/prices, gates, facilities."""

import uuid

from app.models.booking import VisitorActivity
from app.models.enums import VisitorCategory
from app.models.visitor import Visitor
from tests.conftest import auth_header


def _create_activity(client, admin_token, code="kayaking", name="Kayaking"):
    return client.post(
        "/activities",
        headers=auth_header(admin_token),
        json={
            "code": code,
            "name": name,
            "is_free": False,
            "is_active": True,
            "rates": [
                {"category": "FNR", "amount_minor": 3500},
                {"category": "EAC", "amount_minor": 25000},
            ],
        },
    )


# --- Activities & prices -------------------------------------------------


def test_management_can_create_activity_with_rates(client, admin_token):
    response = _create_activity(client, admin_token)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["code"] == "kayaking"
    rates = {r["category"]: r for r in body["rates"]}
    assert rates["FNR"]["amount_minor"] == 3500
    assert rates["FNR"]["currency"] == "USD"
    assert rates["EAC"]["amount_minor"] == 25000
    assert rates["EAC"]["currency"] == "UGX"


def test_duplicate_activity_code_is_rejected(client, admin_token):
    assert _create_activity(client, admin_token).status_code == 201
    assert _create_activity(client, admin_token).status_code == 409


def test_management_can_update_activity(client, admin_token):
    activity_id = _create_activity(client, admin_token).json()["id"]
    response = client.patch(
        f"/activities/{activity_id}",
        headers=auth_header(admin_token),
        json={"name": "Sea Kayaking", "is_active": False},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Sea Kayaking"
    assert body["is_active"] is False


def test_management_can_replace_activity_rates(client, admin_token):
    activity_id = _create_activity(client, admin_token).json()["id"]
    response = client.put(
        f"/activities/{activity_id}/rates",
        headers=auth_header(admin_token),
        json=[{"category": "FR", "amount_minor": 3000}],
    )
    assert response.status_code == 200
    rates = {r["category"]: r for r in response.json()["rates"]}
    assert set(rates) == {"FR"}  # FNR/EAC pruned
    assert rates["FR"]["amount_minor"] == 3000
    assert rates["FR"]["currency"] == "USD"


def test_management_can_delete_unused_activity(client, admin_token):
    activity_id = _create_activity(client, admin_token).json()["id"]
    response = client.delete(f"/activities/{activity_id}", headers=auth_header(admin_token))
    assert response.status_code == 204
    codes = [a["code"] for a in client.get("/activities", headers=auth_header(admin_token)).json()]
    assert "kayaking" not in codes


def test_referenced_activity_cannot_be_deleted(client, admin_token, db_session):
    activity_id = uuid.UUID(_create_activity(client, admin_token).json()["id"])
    visitor = Visitor(full_name="Test Visitor", id_number="ID-1", category=VisitorCategory.FNR)
    db_session.add(visitor)
    db_session.flush()
    db_session.add(
        VisitorActivity(
            visitor_id=visitor.id,
            activity_id=activity_id,
            category=VisitorCategory.FNR,
            quantity=1,
            unit_amount_minor=3500,
            amount_minor=3500,
            currency="USD",
        )
    )
    db_session.commit()

    response = client.delete(f"/activities/{activity_id}", headers=auth_header(admin_token))
    assert response.status_code == 409


def test_officer_cannot_manage_activities(client, admin_token, gate_officer_token):
    activity_id = _create_activity(client, admin_token).json()["id"]
    assert client.post(
        "/activities",
        headers=auth_header(gate_officer_token),
        json={"code": "x", "name": "X", "is_free": True},
    ).status_code == 403
    assert client.patch(
        f"/activities/{activity_id}",
        headers=auth_header(gate_officer_token),
        json={"name": "Y"},
    ).status_code == 403
    assert client.delete(
        f"/activities/{activity_id}", headers=auth_header(gate_officer_token)
    ).status_code == 403


def test_activity_management_requires_authentication(client):
    assert client.post("/activities", json={"code": "x", "name": "X"}).status_code == 401


# --- Gates ---------------------------------------------------------------


def test_gates_are_seeded_and_manageable(client, admin_token):
    seeded = client.get("/config/gates", headers=auth_header(admin_token)).json()
    assert len(seeded) >= 1

    created = client.post(
        "/config/gates", headers=auth_header(admin_token), json={"name": "New Gate"}
    )
    assert created.status_code == 201
    gate_id = created.json()["id"]

    updated = client.patch(
        f"/config/gates/{gate_id}",
        headers=auth_header(admin_token),
        json={"name": "Renamed Gate", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Gate"
    assert updated.json()["is_active"] is False

    assert client.delete(
        f"/config/gates/{gate_id}", headers=auth_header(admin_token)
    ).status_code == 204


def test_duplicate_gate_name_is_rejected(client, admin_token):
    assert client.post(
        "/config/gates", headers=auth_header(admin_token), json={"name": "Dup Gate"}
    ).status_code == 201
    assert client.post(
        "/config/gates", headers=auth_header(admin_token), json={"name": "Dup Gate"}
    ).status_code == 409


def test_officer_cannot_manage_gates(client, admin_token, activity_officer_token):
    assert client.get(
        "/config/gates", headers=auth_header(activity_officer_token)
    ).status_code == 403
    assert client.post(
        "/config/gates", headers=auth_header(activity_officer_token), json={"name": "Z"}
    ).status_code == 403


# --- Facilities ----------------------------------------------------------


def test_facilities_are_seeded_and_manageable(client, admin_token):
    seeded = client.get("/config/facilities", headers=auth_header(admin_token)).json()
    assert len(seeded) >= 1

    created = client.post(
        "/config/facilities", headers=auth_header(admin_token), json={"name": "New Lodge"}
    )
    assert created.status_code == 201
    facility_id = created.json()["id"]

    updated = client.patch(
        f"/config/facilities/{facility_id}",
        headers=auth_header(admin_token),
        json={"is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False

    assert client.delete(
        f"/config/facilities/{facility_id}", headers=auth_header(admin_token)
    ).status_code == 204


def test_duplicate_facility_name_is_rejected(client, admin_token):
    assert client.post(
        "/config/facilities", headers=auth_header(admin_token), json={"name": "Dup Lodge"}
    ).status_code == 201
    assert client.post(
        "/config/facilities", headers=auth_header(admin_token), json={"name": "Dup Lodge"}
    ).status_code == 409


def test_officer_cannot_manage_facilities(client, admin_token, gate_officer_token):
    assert client.get(
        "/config/facilities", headers=auth_header(gate_officer_token)
    ).status_code == 403
    assert client.post(
        "/config/facilities", headers=auth_header(gate_officer_token), json={"name": "Z"}
    ).status_code == 403
