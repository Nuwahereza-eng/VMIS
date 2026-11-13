"""Visitor tour tracking (VMIS tracking feature, section 5).

A ``VisitSession`` is one visitor's tour on their own phone, opened by linking
the phone to a ticket at the gate. The ticket is either a walk-in entry record
(``visits``) or a paid online booking (``bookings``): ``ticket_kind`` says which
and ``ticket_id`` holds its id (no foreign key, mirroring how scans reference
visits, so a session is never orphaned by where the ticket was written).

Location points and nearby alerts are recorded on the phone first, with
client-generated ids, and arrive through the sync engine; the id is the primary
key, so a repeated upload never stores a point twice. Location is personal data
with its own retention period (``location_retention_days``).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class VisitSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "visit_sessions"

    # "visit" (walk-in entry record) or "booking" (paid online booking).
    ticket_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    ticket_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    # The registered visitor, when the ticket is a walk-in entry.
    visitor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    # Gate the phone was linked at (gate names are the reference, as in visits).
    gate: Mapped[str | None] = mapped_column(String(128), nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # "exit" (exit recorded), "expired" (ticket ran out).
    end_reason: Mapped[str | None] = mapped_column(String(16), nullable=True)

    consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Denormalised from the newest point so the live view needs no scan.
    last_point_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        # One open session per ticket (partial unique index; Postgres + SQLite).
        Index(
            "uq_visit_sessions_open_ticket",
            "ticket_kind",
            "ticket_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
            sqlite_where=text("ended_at IS NULL"),
        ),
    )


class LocationPoint(Base):
    __tablename__ = "location_points"

    # Generated on the phone: the idempotency key for repeated uploads.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visit_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PointOfInterest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "points_of_interest"

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # "facility" or "activity".
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=150)
    opening_hours: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Link to the activity catalogue where the point is an activity.
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("activities.id", ondelete="SET NULL"), nullable=True
    )


class PoiAlert(Base):
    __tablename__ = "poi_alerts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visit_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    poi_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("points_of_interest.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shown_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
