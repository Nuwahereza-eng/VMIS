"""Visit reminders and upcoming-visit monitoring (supervisor priority 5)."""

from datetime import date, timedelta

from tests.conftest import auth_header


def _book(client, token, intended, name="Reminder Party", **extra):
    payload = {"full_name": name, "intended_date": str(intended)}
    payload.update(extra)
    resp = client.post("/bookings", headers=auth_header(token), json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_reminders_requires_management(client, gate_officer_token):
    resp = client.get("/management/reminders", headers=auth_header(gate_officer_token))
    assert resp.status_code == 403


def test_week_before_booking_is_due(client, admin_token):
    _book(client, admin_token, date.today() + timedelta(days=7))
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    kinds = {i["kind"] for i in data["due_now"]}
    assert "week_before" in kinds
    assert data["week_before_count"] == 1


def test_day_before_booking_is_due(client, admin_token):
    _book(client, admin_token, date.today() + timedelta(days=1))
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    kinds = {i["kind"] for i in data["due_now"]}
    assert "day_before" in kinds
    assert data["day_before_count"] == 1


def test_far_out_booking_is_upcoming_not_due(client, admin_token):
    _book(client, admin_token, date.today() + timedelta(days=30))
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    assert data["due_now"] == []
    assert len(data["upcoming"]) == 1
    assert data["upcoming"][0]["kind"] == "scheduled"


def test_today_booking_counts_as_day_reminder(client, admin_token):
    _book(client, admin_token, date.today())
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    kinds = {i["kind"] for i in data["due_now"]}
    assert "due_today" in kinds
    assert data["day_before_count"] == 1


def test_past_pending_booking_is_overdue(client, admin_token):
    _book(client, admin_token, date.today() - timedelta(days=3))
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    assert len(data["overdue"]) == 1
    assert data["overdue"][0]["kind"] == "overdue"
    assert data["overdue"][0]["days_until"] == -3


def test_contactable_flag_reflects_phone_or_email(client, admin_token):
    _book(client, admin_token, date.today() + timedelta(days=1), name="Has Phone", phone="0700000000")
    _book(client, admin_token, date.today() + timedelta(days=1), name="No Contact")
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    by_name = {i["full_name"]: i for i in data["due_now"]}
    assert by_name["Has Phone"]["contactable"] is True
    assert by_name["No Contact"]["contactable"] is False


def test_arrived_booking_drops_out_of_reminders(client, admin_token):
    # Register a visitor and match the booking to them -> status arrived.
    visitor_id = client.post(
        "/visitors",
        headers=auth_header(admin_token),
        json={
            "full_name": "Arrived Visitor",
            "id_number": "REM-1",
            "category": "FNR",
            "privacy_notice_accepted": True,
        },
    ).json()["visitor"]["id"]
    booking_id = _book(client, admin_token, date.today() + timedelta(days=1))
    client.patch(
        f"/bookings/{booking_id}",
        headers=auth_header(admin_token),
        json={"visitor_id": visitor_id},
    )
    data = client.get("/management/reminders", headers=auth_header(admin_token)).json()
    assert data["due_now"] == []
