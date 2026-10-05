"""add payment and ticket fields to bookings

Revision ID: b7e4d2a1c9f8
Revises: a2c5e8d1f3b6
Create Date: 2026-10-05 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e4d2a1c9f8"
down_revision: Union[str, None] = "a2c5e8d1f3b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("amount_minor", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("currency", sa.String(length=3), nullable=True))
    op.add_column(
        "bookings",
        sa.Column(
            "payment_status",
            sa.String(length=8),
            nullable=False,
            server_default="unpaid",
        ),
    )
    op.add_column("bookings", sa.Column("payment_method", sa.String(length=32), nullable=True))
    op.add_column("bookings", sa.Column("payment_reference", sa.String(length=64), nullable=True))
    op.add_column("bookings", sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("ticket_code", sa.String(length=32), nullable=True))
    op.create_index(op.f("ix_bookings_payment_status"), "bookings", ["payment_status"], unique=False)
    op.create_index(op.f("ix_bookings_ticket_code"), "bookings", ["ticket_code"], unique=True)
    # Drop the server default now that existing rows are backfilled; the ORM
    # supplies the value for new rows.
    op.alter_column("bookings", "payment_status", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_bookings_ticket_code"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_payment_status"), table_name="bookings")
    op.drop_column("bookings", "ticket_code")
    op.drop_column("bookings", "paid_at")
    op.drop_column("bookings", "payment_reference")
    op.drop_column("bookings", "payment_method")
    op.drop_column("bookings", "payment_status")
    op.drop_column("bookings", "currency")
    op.drop_column("bookings", "amount_minor")
