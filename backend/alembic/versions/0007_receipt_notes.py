"""receipts.notes — purpose/detail note shown alongside receipts, matching
the invoice/quotation "Purpose" field. Additive only, nullable.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-25

"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("receipts", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("receipts", "notes")
