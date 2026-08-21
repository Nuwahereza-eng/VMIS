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

    category: Mapped[VisitorCategory] = mapped_column(
        Enum(VisitorCategory, native_enum=False, length=8), nullable=False
    )

    # A privacy notice must be shown and acknowledged at registration.
    privacy_notice_accepted: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
