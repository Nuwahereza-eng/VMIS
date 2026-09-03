"""Configurable master lists managed by park management.

Gates (park entry/exit points) and accommodation facilities (lodges, campsites)
are reference data that changes rarely but must be editable without a code
change. They are plain master tables keyed by ``name``; visits and accommodation
records still store the chosen value as a free-form string, so deleting a master
row never breaks historical data (there is deliberately no foreign key).
``is_active`` lets management retire an entry from pickers without deleting it.
"""

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Gate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "gates"

    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Facility(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "facilities"

    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
