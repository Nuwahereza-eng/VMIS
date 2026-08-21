"""Declarative base and shared model mixins.

Offline-first is architectural (build prompt section 2 and section 7): every
domain record is written local-first at a station, so identifiers are generated
at the station (never a server sequential id) and every record carries the
station of origin and a server-receipt timestamp from the very first migration.
Timestamps are always timezone-aware UTC so a station with a wrong local clock
cannot corrupt a stored value.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    """Timezone-aware current time in UTC (ISO 8601 when serialised)."""
    return datetime.now(timezone.utc)


def ensure_utc(value: datetime | None) -> datetime | None:
    """Normalise a stored datetime to timezone-aware UTC.

    Some stores (e.g. SQLite) return naive datetimes even for timezone-aware
    columns. Such values are always written as UTC, so a missing tzinfo is
    read back as UTC. This keeps the API's timestamps in one unambiguous form.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    """Station-generated UUID primary key.

    Defaulting to ``uuid4`` means two stations creating records while offline
    cannot collide (build prompt section 4.1 / section 9). Clients supply their
    own UUID; the server accepts it as submitted for routine record creation.
    """

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class SyncMixin:
    """Fields every offline-capable record needs from day one.

    ``origin_station_id`` records where the row was first written.
    ``client_created_at`` is the station's own timestamp at creation.
    ``server_received_at`` is set when the central server first merges the row;
    NULL means the row has not yet reached the system of record.
    """

    origin_station_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    client_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    server_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
