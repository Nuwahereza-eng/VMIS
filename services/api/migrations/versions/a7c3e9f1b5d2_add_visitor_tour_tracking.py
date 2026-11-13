"""add visitor tour tracking: sessions, location points, points of interest, alerts

Revision ID: a7c3e9f1b5d2
Revises: f3b9d1c7a5e2
Create Date: 2026-11-13 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c3e9f1b5d2"
down_revision: Union[str, None] = "f3b9d1c7a5e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "visit_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("ticket_kind", sa.String(length=16), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("visitor_id", sa.Uuid(), nullable=True),
        sa.Column("gate", sa.String(length=128), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(length=16), nullable=True),
        sa.Column("consent_given", sa.Boolean(), nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_point_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_latitude", sa.Float(), nullable=True),
        sa.Column("last_longitude", sa.Float(), nullable=True),
        sa.Column("last_accuracy", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_visit_sessions_ticket_id"), "visit_sessions", ["ticket_id"])
    op.create_index(op.f("ix_visit_sessions_visitor_id"), "visit_sessions", ["visitor_id"])
    op.create_index(
        "uq_visit_sessions_open_ticket",
        "visit_sessions",
        ["ticket_kind", "ticket_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
        sqlite_where=sa.text("ended_at IS NULL"),
    )

    op.create_table(
        "points_of_interest",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("radius_m", sa.Integer(), nullable=False),
        sa.Column("opening_hours", sa.String(length=128), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("activity_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["activity_id"], ["activities.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "location_points",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["visit_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_location_points_session_id"), "location_points", ["session_id"])
    op.create_index(op.f("ix_location_points_recorded_at"), "location_points", ["recorded_at"])

    op.create_table(
        "poi_alerts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("poi_id", sa.Uuid(), nullable=False),
        sa.Column("shown_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["visit_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["poi_id"], ["points_of_interest.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_poi_alerts_session_id"), "poi_alerts", ["session_id"])
    op.create_index(op.f("ix_poi_alerts_poi_id"), "poi_alerts", ["poi_id"])
    op.create_index(op.f("ix_poi_alerts_shown_at"), "poi_alerts", ["shown_at"])


def downgrade() -> None:
    op.drop_table("poi_alerts")
    op.drop_table("location_points")
    op.drop_table("points_of_interest")
    op.drop_index("uq_visit_sessions_open_ticket", table_name="visit_sessions")
    op.drop_table("visit_sessions")
