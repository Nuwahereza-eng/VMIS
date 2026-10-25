"""add gate check-in/check-out fields to bookings

Revision ID: e8a4c2f6b1d3
Revises: b7e4d2a1c9f8
Create Date: 2026-10-19 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8a4c2f6b1d3"
down_revision: Union[str, None] = "b7e4d2a1c9f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("entry_gate", sa.String(length=64), nullable=True))
    op.add_column("bookings", sa.Column("departed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "departed_at")
    op.drop_column("bookings", "entry_gate")
