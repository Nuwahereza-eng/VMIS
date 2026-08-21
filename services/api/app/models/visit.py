"""Visit record: a visitor's entry to the park and their matching exit.

Entry captures gate, timestamp, officer, ticket number, and nights purchased
(build prompt section 4.1). Exit is recorded against the same visit on
departure; a visit with no exit is an open stay. Ticket expiry and status are
NOT stored here: they are derived on every request from ``entry_timestamp`` and
``nights_purchased`` (build prompt Table 4), so a stored value can never go
stale. Offline-first fields come from ``SyncMixin``.
"""

import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from datetime import datetime

from app.models.base import Base, SyncMixin, TimestampMixin, UUIDPrimaryKeyMixin


class Visit(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "visits"

    visitor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visitors.id"), nullable=False, index=True
    )

    # Entry (always present).
    entry_gate: Mapped[str] = mapped_column(String(64), nullable=False)
    entry_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    entry_officer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    ticket_number: Mapped[str] = mapped_column(String(64), nullable=False)
    nights_purchased: Mapped[int] = mapped_column(Integer, nullable=False)

    # Exit (NULL until the visitor departs). NULL exit_timestamp == open stay.
    exit_gate: Mapped[str | None] = mapped_column(String(64), nullable=True)
    exit_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exit_officer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)

    @property
    def is_open(self) -> bool:
        return self.exit_timestamp is None
