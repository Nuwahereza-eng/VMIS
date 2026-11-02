"""Resolve whatever an officer scans or types to a single visitor.

The Scan screen accepts more than the canonical QR payload, because real gates
see all of these:

- ``VMIS:1:<uuid>``  the canonical visitor QR (see app.qr)
- ``<uuid>``         QR codes printed by app versions that encoded the bare id
- ``VM-1A2B3C4D``    the short visitor code shown on screen and on tickets
- a passport / national ID number typed by hand

Ambiguous input (a short code or ID number shared by several visitors) returns
nothing rather than guessing the wrong person.
"""

import re
import uuid

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from app.models.visitor import Visitor
from app.qr import InvalidQrPayload, parse_qr_payload

_SHORT_CODE = re.compile(r"^VM-?([0-9A-F]{8})$", re.IGNORECASE)


def _single(rows: list[Visitor]) -> Visitor | None:
    return rows[0] if len(rows) == 1 else None


def resolve_visitor(db: Session, text: str) -> Visitor | None:
    raw = (text or "").strip()
    if not raw:
        return None

    try:
        return db.get(Visitor, parse_qr_payload(raw))
    except InvalidQrPayload:
        pass

    try:
        return db.get(Visitor, uuid.UUID(raw))
    except ValueError:
        pass

    match = _SHORT_CODE.match(raw)
    if match:
        prefix = match.group(1).lower()
        rows = db.scalars(
            select(Visitor).where(func.lower(cast(Visitor.id, String)).like(f"{prefix}%")).limit(2)
        ).all()
        return _single(list(rows))

    rows = db.scalars(
        select(Visitor).where(func.lower(Visitor.id_number) == raw.lower()).limit(2)
    ).all()
    return _single(list(rows))
