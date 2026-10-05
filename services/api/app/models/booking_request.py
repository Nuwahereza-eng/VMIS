"""Pre-booking / expression-of-interest records (supervisor priority 2).

A booking is captured before a visitor arrives: intended date, origin country,
expected entry gate, planned length of stay, accommodation, and party details.
Management uses it to see who is expected on any given day and to distinguish
pre-booked arrivals from walk-ins. A booking is linked to the real visitor on
arrival via ``visitor_id`` (no foreign key: the visitor may be registered on
another station). Offline-first fields come from ``SyncMixin``; bookings are
captured online-first today.
"""

import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, Enum, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BookingStatus, VisitorCategory


class Booking(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "bookings"

    # Party contact / lead visitor details (PII, minimised).
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tour_company: Mapped[str | None] = mapped_column(String(128), nullable=True)

    category: Mapped[VisitorCategory | None] = mapped_column(
        Enum(VisitorCategory, native_enum=False, length=8), nullable=True
    )
    party_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Plan details.
    intended_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    expected_gate: Mapped[str | None] = mapped_column(String(64), nullable=True)
    length_of_stay_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    accommodation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, native_enum=False, length=16),
        default=BookingStatus.PENDING,
        nullable=False,
        index=True,
    )
    # Set when the booking is matched to a registered visitor on arrival.
    visitor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Officer who captured the booking.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
