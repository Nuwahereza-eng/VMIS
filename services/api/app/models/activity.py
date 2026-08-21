"""Activity catalogue and per-category rates (build prompt Table 1, section 4.1).

An ``Activity`` is a bookable item (park entrance, game drive, launch trip,
etc.). Its price depends on the visitor's category, so rates live in a separate
``ActivityRate`` table keyed by (activity, category). Amounts are always integer
minor units with the currency recorded alongside (build prompt section 2); the
rate table is seed data, not hardcoded logic. Free activities (e.g. wildlife
clubs) carry ``is_free`` and need no rate rows.
"""

import uuid

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import VisitorCategory


class Activity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "activities"

    # Stable business key used by seeds and clients (e.g. "park_entrance").
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    is_free: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ActivityRate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "activity_rates"
    __table_args__ = (
        UniqueConstraint("activity_id", "category", name="uq_activity_rate_activity_category"),
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("activities.id"), nullable=False, index=True
    )
    category: Mapped[VisitorCategory] = mapped_column(
        Enum(VisitorCategory, native_enum=False, length=8), nullable=False
    )
    # Integer minor units (never a float) plus ISO 4217 currency.
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
