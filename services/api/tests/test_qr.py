"""QR payload unit tests."""

import uuid

import pytest

from app.qr import (
    InvalidQrPayload,
    build_qr_payload,
    parse_qr_payload,
    render_qr_png,
)


def test_payload_round_trip():
    visitor_id = uuid.uuid4()
    payload = build_qr_payload(visitor_id)
    assert payload == f"VMIS:1:{visitor_id}"
    assert parse_qr_payload(payload) == visitor_id


def test_payload_ignores_surrounding_whitespace():
    visitor_id = uuid.uuid4()
    assert parse_qr_payload(f"  {build_qr_payload(visitor_id)}\n") == visitor_id


@pytest.mark.parametrize(
    "bad",
    [
        "",
        "just-text",
        "VMIS:1:not-a-uuid",
        "VMIS:2:" + str(uuid.uuid4()),  # wrong version
        "OTHER:1:" + str(uuid.uuid4()),  # wrong prefix
        str(uuid.uuid4()),  # bare uuid, no framing
    ],
)
def test_parse_rejects_malformed(bad):
    with pytest.raises(InvalidQrPayload):
        parse_qr_payload(bad)


def test_render_png_is_a_png():
    png = render_qr_png(build_qr_payload(uuid.uuid4()))
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
