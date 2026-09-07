"""Scan events: the movement trail of a visitor through the park.

Each row is one QR scan performed by an officer at an entrance gate, an
internal checkpoint, or an exit gate (supervisor priority 3). The scan trail is
the source of truth for a visitor's *current position* status
(``Inside the park`` / ``At a checkpoint`` / ``Exited``), which is derived on
read and never stored. ``visit_id`` links a scan to the open visit it belongs
to when known, but carries no foreign key so a scan is never orphaned if the
matching visit lives on another station. Offline-first fields come from
``SyncMixin`` for future sync support; scans are recorded online-first today.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import ScanKind


class ScanEvent(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "scan_events"

    visitor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visitors.id"), nullable=False, index=True
    )
    # Visit this scan belongs to when known. No FK on purpose: a scan taken at a
    # remote station must never fail because the visit row is elsewhere.
    visit_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)

    kind: Mapped[ScanKind] = mapped_column(
        Enum(ScanKind, native_enum=False, length=16), nullable=False
    )
    # Free-text location label of the scan point (gate or checkpoint name).
    location: Mapped[str] = mapped_column(String(128), nullable=False)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Officer who performed the scan (no FK, mirrors visit officer fields).
    officer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
