"""Emailing a paid booking's ticket (QR + trip details).

Bookings captured at a gate belong to visitors with no account, so the ticket
is emailed to them instead. The "memory" mail backend captures messages.
"""

import pytest

from app import mailer
from app.config import get_settings
from app.mailer import InlineImage, OutgoingEmail, _build_mime
from tests.conftest import auth_header


@pytest.fixture
def outbox(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_backend", "memory")
    mailer.OUTBOX.clear()
    yield mailer.OUTBOX
    mailer.OUTBOX.clear()


def _gate_booking(client, token, **overrides):
    payload = {
        "full_name": "Walk-in Visitor",
        "intended_date": "2026-12-10",
        "category": "FNR",
        "party_size": 2,
        "expected_gate": "Tangi Gate",
        "email": "walkin@example.com",
    }
    payload.update(overrides)
    return client.post("/bookings", headers=auth_header(token), json=payload).json()


def _pay(client, token, booking_id):
    return client.post(f"/bookings/{booking_id}/pay", headers=auth_header(token), json={"method": "cash"}).json()


def test_officer_emails_ticket_with_qr(client, gate_officer_token, outbox):
    booking = _gate_booking(client, gate_officer_token)
    paid = _pay(client, gate_officer_token, booking["id"])

    resp = client.post(f"/bookings/{booking['id']}/email-ticket", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 200, resp.text
    assert resp.json()["ticket_emailed_at"] is not None

    assert len(outbox) == 1
    sent = outbox[0]
    assert sent.to == "walkin@example.com"
    assert paid["ticket_code"] in sent.subject
    assert paid["ticket_code"] in sent.text
    assert "cid:ticket-qr" in sent.html
    assert "90.00 USD" in sent.text  # 2 x USD 45.00
    qr = sent.images[0]
    assert qr.content_id == "ticket-qr"
    assert qr.data.startswith(b"\x89PNG")


def test_email_can_be_supplied_when_missing(client, gate_officer_token, outbox):
    booking = _gate_booking(client, gate_officer_token, email=None)
    _pay(client, gate_officer_token, booking["id"])
    url = f"/bookings/{booking['id']}/email-ticket"

    missing = client.post(url, headers=auth_header(gate_officer_token), json={})
    assert missing.status_code == 422
    assert not outbox

    resp = client.post(url, headers=auth_header(gate_officer_token), json={"email": " Late@Example.com "})
    assert resp.status_code == 200, resp.text
    assert resp.json()["email"] == "late@example.com"
    assert outbox[0].to == "late@example.com"


def test_invalid_email_rejected(client, gate_officer_token, outbox):
    booking = _gate_booking(client, gate_officer_token)
    _pay(client, gate_officer_token, booking["id"])
    resp = client.post(
        f"/bookings/{booking['id']}/email-ticket",
        headers=auth_header(gate_officer_token),
        json={"email": "not-an-email"},
    )
    assert resp.status_code == 422


def test_unpaid_booking_has_no_ticket_to_send(client, gate_officer_token, outbox):
    booking = _gate_booking(client, gate_officer_token)
    resp = client.post(f"/bookings/{booking['id']}/email-ticket", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 409
    assert not outbox


def test_not_configured_reports_503(client, gate_officer_token, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_backend", "none")
    booking = _gate_booking(client, gate_officer_token)
    _pay(client, gate_officer_token, booking["id"])
    resp = client.post(f"/bookings/{booking['id']}/email-ticket", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 503
    assert "isn't set up" in resp.json()["detail"]
    after = client.get(f"/bookings/{booking['id']}", headers=auth_header(gate_officer_token)).json()
    assert after["ticket_emailed_at"] is None


def test_tourist_can_only_email_own_ticket(client, gate_officer_token, outbox):
    tourist = client.post(
        "/auth/register",
        json={"email": "t@example.com", "password": "touristpass123", "full_name": "T"},
    ).json()["access_token"]
    booking = _gate_booking(client, gate_officer_token)
    _pay(client, gate_officer_token, booking["id"])
    resp = client.post(f"/bookings/{booking['id']}/email-ticket", headers=auth_header(tourist), json={})
    assert resp.status_code == 403


def test_mime_embeds_qr_inline():
    message = OutgoingEmail(
        to="a@example.com",
        subject="s",
        text="plain",
        html='<img src="cid:ticket-qr">',
        images=[InlineImage(content_id="ticket-qr", filename="MF-X.png", data=b"\x89PNG fake")],
    )
    mime = _build_mime(message, "Park <tickets@example.org>")
    raw = mime.as_string()
    assert "multipart/alternative" in raw
    assert "multipart/related" in raw
    assert "Content-ID: <ticket-qr>" in raw
    assert 'filename="MF-X.png"' in raw
