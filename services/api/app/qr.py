"""QR code payload and rendering for visitor identification.

The QR encodes only the station-generated visitor identifier (build prompt
section 4.1). Verification resolves that identifier against the local record, so
the payload stays deliberately small and carries no personal data. The payload
is versioned so scanners can evolve the format without ambiguity:

    VMIS:1:<visitor-uuid>

Rendering uses segno (pure Python, no native dependencies).
"""

import io
import uuid

import segno

_PREFIX = "VMIS"
_VERSION = "1"


class InvalidQrPayload(ValueError):
    """Raised when a scanned string is not a valid VMIS visitor payload."""


def build_qr_payload(visitor_id: uuid.UUID) -> str:
    return f"{_PREFIX}:{_VERSION}:{visitor_id}"


def parse_qr_payload(text: str) -> uuid.UUID:
    """Parse a scanned payload back to a visitor id.

    Raises ``InvalidQrPayload`` on any malformed input.
    """
    parts = text.strip().split(":")
    if len(parts) != 3 or parts[0] != _PREFIX or parts[1] != _VERSION:
        raise InvalidQrPayload("Not a VMIS visitor QR payload")
    try:
        return uuid.UUID(parts[2])
    except ValueError as exc:
        raise InvalidQrPayload("Malformed visitor identifier in QR payload") from exc


def render_qr_png(payload: str, scale: int = 6) -> bytes:
    """Render a payload to PNG bytes suitable for printing or on-screen display."""
    buffer = io.BytesIO()
    segno.make(payload, error="m").save(buffer, kind="png", scale=scale)
    return buffer.getvalue()
