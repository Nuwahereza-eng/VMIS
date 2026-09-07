"""add scan_events table (visitor status lifecycle + checkpoint scanning)

Revision ID: f1a3c7b9e2d5
Revises: d5e2f1a9c8b7
Create Date: 2026-09-04 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a3c7b9e2d5"
down_revision: Union[str, None] = "d5e2f1a9c8b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scan_events",
        sa.Column("visitor_id", sa.Uuid(), nullable=False),
        sa.Column("visit_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("location", sa.String(length=128), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("officer_id", sa.Uuid(), nullable=True),
        sa.Column("origin_station_id", sa.String(length=64), nullable=True),
        sa.Column("client_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("server_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["visitor_id"], ["visitors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scan_events_visitor_id"), "scan_events", ["visitor_id"], unique=False)
    op.create_index(op.f("ix_scan_events_visit_id"), "scan_events", ["visit_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_scan_events_visit_id"), table_name="scan_events")
    op.drop_index(op.f("ix_scan_events_visitor_id"), table_name="scan_events")
    op.drop_table("scan_events")
