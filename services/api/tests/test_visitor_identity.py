"""Visitor identity end to end: editing details, finding a visitor from any
scan or typed value, and emailing a visitor their QR ticket."""

import uuid

import pytest

from app import mailer
from app.config import get_settings
from app.qr import build_qr_payload
from tests.conftest import auth_header


def _register(client, token, **overrides):
    payload = {
        "full_name": "Grace Achieng",
        "id_number": "PA123456",
        "category": "EAC",
        "privacy_notice_accepted": True,
    }
    payload.update(overrides)
    resp = client.post("/visitors", headers=auth_header(token), json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["visitor"]


def _update(client, token, visitor_id, changes, op_id=None):
    resp = client.post(
        "/sync/batch",
        headers=auth_header(token),
        json={
            "station_id": "GATE-A",
            "operations": [
                {
                    "op_id": str(op_id or uuid.uuid4()),
                    "entity_type": "visitor_update",
                    "entity_id": str(visitor_id),
                    "payload": changes,
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["results"][0]


def _verify(client, token, text):
    return client.post("/visitors/verify", headers=auth_header(token), json={"payload": text}).json()


# --- editing ---


def test_visitor_update_changes_details(client, gate_officer_token):
    v = _register(client, gate_officer_token)
    result = _update(
        client, gate_officer_token, v["id"],
        {"phone": "+256700000001", "email": "grace@example.com", "full_name": "Grace A. Achieng"},
    )
    assert result["result"] == "applied"

    fresh = client.get(f"/visitors/{v['id']}", headers=auth_header(gate_officer_token)).json()
    assert fresh["phone"] == "+256700000001"
    assert fresh["email"] == "grace@example.com"
    assert fresh["full_name"] == "Grace A. Achieng"
    assert fresh["id_number"] == "PA123456"  # untouched


def test_visitor_update_is_idempotent_and_never_blanks_required(client, gate_officer_token):
    v = _register(client, gate_officer_token)
    op = uuid.uuid4()
    assert _update(client, gate_officer_token, v["id"], {"phone": "1"}, op_id=op)["result"] == "applied"
    assert _update(client, gate_officer_token, v["id"], {"phone": "1"}, op_id=op)["result"] == "duplicate"
    # Same values again under a new op: nothing to change.
    assert _update(client, gate_officer_token, v["id"], {"phone": "1"})["result"] == "exists"

    _update(client, gate_officer_token, v["id"], {"full_name": "   ", "phone": ""})
    fresh = client.get(f"/visitors/{v['id']}", headers=auth_header(gate_officer_token)).json()
    assert fresh["full_name"] == "Grace Achieng"
    assert fresh["phone"] is None  # optional fields can be cleared


def test_update_for_unknown_visitor_is_kept_as_exception(client, gate_officer_token):
    result = _update(client, gate_officer_token, uuid.uuid4(), {"phone": "1"})
    assert result["result"] == "conflict"
    assert result["exception_kind"] == "missing_visitor"


# --- finding a visitor from a scan or typed value ---


def test_verify_accepts_every_form_of_visitor_identity(client, gate_officer_token):
    v = _register(client, gate_officer_token)
    vid = uuid.UUID(v["id"])
    code = "VM-" + vid.hex[:8].upper()

    for text in (build_qr_payload(vid), str(vid), code, code.lower(), "pa123456"):
        result = _verify(client, gate_officer_token, text)
        assert result["found"], text
        assert result["visitor"]["id"] == v["id"]


def test_verify_unknown_or_ambiguous_returns_not_found(client, gate_officer_token):
    _register(client, gate_officer_token, full_name="Twin One", id_number="DUP1")
    _register(client, gate_officer_token, full_name="Twin Two", id_number="DUP1")
    assert _verify(client, gate_officer_token, "DUP1")["found"] is False
    assert _verify(client, gate_officer_token, "VM-00000000")["found"] is False
    assert _verify(client, gate_officer_token, "nonsense")["found"] is False


# --- emailing a visitor their ticket ---


@pytest.fixture
def outbox(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_backend", "memory")
    mailer.OUTBOX.clear()
    yield mailer.OUTBOX
    mailer.OUTBOX.clear()


def test_email_visitor_ticket_with_current_entry(client, gate_officer_token, outbox):
    v = _register(client, gate_officer_token, email="grace@example.com")
    entry = client.post(
        "/visits",
        headers=auth_header(gate_officer_token),
        json={"visitor_id": v["id"], "ticket_number": "TCK-1", "nights_purchased": 2, "entry_gate": "Tangi Gate"},
    )
    assert entry.status_code == 201, entry.text

    resp = client.post(f"/visitors/{v['id']}/email-ticket", headers=auth_header(gate_officer_token), json={})
    assert resp.status_code == 200, resp.text
    sent = outbox[0]
    assert sent.to == "grace@example.com"
    assert "TCK-1" in sent.text and "Tangi Gate" in sent.text and "Valid until" in sent.text
    assert sent.images[0].data.startswith(b"\x89PNG")


def test_email_visitor_ticket_needs_an_address(client, gate_officer_token, outbox):
    v = _register(client, gate_officer_token)
    url = f"/visitors/{v['id']}/email-ticket"
    assert client.post(url, headers=auth_header(gate_officer_token), json={}).status_code == 422
    resp = client.post(url, headers=auth_header(gate_officer_token), json={"email": "g@example.com"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "g@example.com"


def test_activity_officer_cannot_email_visitor_ticket(client, gate_officer_token, activity_officer_token, outbox):
    v = _register(client, gate_officer_token, email="g@example.com")
    resp = client.post(f"/visitors/{v['id']}/email-ticket", headers=auth_header(activity_officer_token), json={})
    assert resp.status_code == 403
