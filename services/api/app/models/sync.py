"""Synchronisation bookkeeping (build prompt sections 3.2.3, 4.1, 9).

``SyncOperation`` is an append-only log of every delta the server has processed,
keyed by the client-generated ``op_id``. Because the op_id is the primary key, a
repeated or interrupted upload that re-sends the same operation is detected and
skipped, which is what guarantees zero duplicate records on replay.

``SyncException`` is the exceptions list: business-rule violations that cannot be
auto-resolved (e.g. contradictory exit records for the same visitor, or two
stations registering what each believes is a new visitor) are written here for a
human supervisor to settle. They are never silently dropped or auto-picked.
"""

import uuid

from sqlalchemy import Boolean, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SyncOperation(TimestampMixin, Base):
    __tablename__ = "sync_operations"

    # Client-generated operation id. Primary key => idempotent replay.
    op_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    station_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Outcome of the first time this op was applied: applied/exists/conflict.
    result: Mapped[str] = mapped_column(String(16), nullable=False)


class SyncException(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sync_exceptions"

    station_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # e.g. "contradictory_exit", "possible_duplicate_visitor".
    kind: Mapped[str] = mapped_column(String(48), nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
