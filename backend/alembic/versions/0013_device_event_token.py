"""Remember which device a blocked login came from

Lets the Supreme Admin's "Acknowledge" on a blocked-login alert approve that
device so the next sign-in from it succeeds.

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-03
"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("device_events", sa.Column("device_token", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("device_events", "device_token")
