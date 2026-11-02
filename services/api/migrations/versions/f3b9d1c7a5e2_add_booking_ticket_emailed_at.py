"""add ticket_emailed_at to bookings

Revision ID: f3b9d1c7a5e2
Revises: e8a4c2f6b1d3
Create Date: 2026-11-02 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3b9d1c7a5e2"
down_revision: Union[str, None] = "e8a4c2f6b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("ticket_emailed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "ticket_emailed_at")
