"""Visitor record.

One record per visitor (build prompt section 4.1). The identifier is a
station-generated UUID so concurrent offline registrations at different gates
cannot collide. Personal data is kept to the minimum needed and is governed by
the Data Protection and Privacy Act, 2019 (build prompt section 8): only
synthetic data is used in development and tests.
"""

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SyncMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import VisitorCategory


class Visitor(UUIDPrimaryKeyMixin, TimestampMixin, SyncMixin, Base):
    __tablename__ = "visitors"

    # PII: minimised and access-restricted by role.
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    id_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    nationality: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Extended visitor profile (build prompt section 8.A). All optional so that
    # a fast gate registration stays possible; management can enrich later.
    country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    age_category: Mapped[str | None] = mapped_column(String(16), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tour_company: Mapped[str | None] = mapped_column(String(128), nullable=True)
    vehicle_registration: Mapped[str | None] = mapped_column(String(32), nullable=True)
    num_visitors: Mapped[int] = mapped_column(default=1, nullable=False)
    guide_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    category: Mapped[VisitorCategory] = mapped_column(
        Enum(VisitorCategory, native_enum=False, length=8), nullable=False
    )

    # A privacy notice must be shown and acknowledged at registration.
    privacy_notice_accepted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Set once this visitor's personal data has been redacted by retention
    # enforcement (build prompt section 8). A redacted record is kept for
    # aggregate reporting but no longer holds identifying data.
    pii_redacted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
