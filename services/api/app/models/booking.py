"""Visitor activity lines and accommodation records (build prompt section 4.1).

``VisitorActivity`` is one activity charged to a visitor. The fee is computed
from the visitor's category at the moment it is added and stored as integer
minor units with its currency, so a later rate change never rewrites past
charges. Multiple activities per visitor are allowed. ``Accommodation`` records
a facility and nights stayed, feeding occupancy and average-stay reporting.
Both carry offline-first sync fields.
"""

import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import VisitorCategory


class VisitorActivity(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "visitor_activities"

    visitor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visitors.id"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("activities.id"), nullable=False, index=True
    )

    # Category applied at charge time (a visitor's category is fixed, but we
    # snapshot it so the line is self-describing).
    category: Mapped[VisitorCategory] = mapped_column(
        Enum(VisitorCategory, native_enum=False, length=8), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Snapshot of the computed fee: unit price x quantity, integer minor units.
    unit_amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)


class Accommodation(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "accommodations"

    visitor_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("visitors.id"), nullable=False, index=True
    )
    facility: Mapped[str] = mapped_column(String(128), nullable=False)
    nights: Mapped[int] = mapped_column(Integer, nullable=False)
