"""add gates and facilities master tables

Revision ID: d5e2f1a9c8b7
Revises: c3f7a1e9b2d4
Create Date: 2026-09-03 09:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e2f1a9c8b7"
down_revision: Union[str, None] = "c3f7a1e9b2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gates",
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_gates_name"), "gates", ["name"], unique=True)
    op.create_table(
        "facilities",
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_facilities_name"), "facilities", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_facilities_name"), table_name="facilities")
    op.drop_table("facilities")
    op.drop_index(op.f("ix_gates_name"), table_name="gates")
    op.drop_table("gates")
