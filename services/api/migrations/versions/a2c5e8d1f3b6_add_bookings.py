"""add bookings table (pre-booking / expression of interest)

Revision ID: a2c5e8d1f3b6
Revises: f1a3c7b9e2d5
Create Date: 2026-09-07 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a2c5e8d1f3b6"
down_revision: Union[str, None] = "f1a3c7b9e2d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("full_name", sa.String(length=128), nullable=False),
        sa.Column("country", sa.String(length=64), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("email", sa.String(length=128), nullable=True),
        sa.Column("tour_company", sa.String(length=128), nullable=True),
        sa.Column("category", sa.String(length=8), nullable=True),
        sa.Column("party_size", sa.Integer(), nullable=False),
        sa.Column("intended_date", sa.Date(), nullable=False),
        sa.Column("expected_gate", sa.String(length=64), nullable=True),
        sa.Column("length_of_stay_nights", sa.Integer(), nullable=False),
        sa.Column("accommodation", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("visitor_id", sa.Uuid(), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("origin_station_id", sa.String(length=64), nullable=True),
        sa.Column("client_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("server_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bookings_intended_date"), "bookings", ["intended_date"], unique=False)
    op.create_index(op.f("ix_bookings_status"), "bookings", ["status"], unique=False)
    op.create_index(op.f("ix_bookings_visitor_id"), "bookings", ["visitor_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bookings_visitor_id"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_status"), table_name="bookings")
    op.drop_index(op.f("ix_bookings_intended_date"), table_name="bookings")
    op.drop_table("bookings")
