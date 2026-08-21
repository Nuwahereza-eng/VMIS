"""add pii_redacted to visitors

Revision ID: 9711abfe54d9
Revises: baf1d24a0db6
Create Date: 2026-08-21 15:45:14.342647
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9711abfe54d9'
down_revision: Union[str, None] = 'baf1d24a0db6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New NOT NULL flag on an existing table: backfill existing rows to False
    # with a server default, then drop the default so the app controls it.
    with op.batch_alter_table('visitors', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'pii_redacted',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
    with op.batch_alter_table('visitors', schema=None) as batch_op:
        batch_op.alter_column('pii_redacted', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('visitors', schema=None) as batch_op:
        batch_op.drop_column('pii_redacted')
