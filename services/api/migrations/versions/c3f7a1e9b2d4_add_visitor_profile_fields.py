"""add extended visitor profile fields

Revision ID: c3f7a1e9b2d4
Revises: 9711abfe54d9
Create Date: 2026-08-24 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f7a1e9b2d4"
down_revision: Union[str, None] = "9711abfe54d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("visitors", schema=None) as batch_op:
        batch_op.add_column(sa.Column("country", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("age_category", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("gender", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("phone", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("email", sa.String(length=128), nullable=True))
        batch_op.add_column(sa.Column("tour_company", sa.String(length=128), nullable=True))
        batch_op.add_column(
            sa.Column("vehicle_registration", sa.String(length=32), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "num_visitors",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("1"),
            )
        )
        batch_op.add_column(sa.Column("guide_name", sa.String(length=128), nullable=True))
    with op.batch_alter_table("visitors", schema=None) as batch_op:
        batch_op.alter_column("num_visitors", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("visitors", schema=None) as batch_op:
        batch_op.drop_column("guide_name")
        batch_op.drop_column("num_visitors")
        batch_op.drop_column("vehicle_registration")
        batch_op.drop_column("tour_company")
        batch_op.drop_column("email")
        batch_op.drop_column("phone")
        batch_op.drop_column("gender")
        batch_op.drop_column("age_category")
        batch_op.drop_column("country")
