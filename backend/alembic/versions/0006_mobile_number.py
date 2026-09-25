"""users.mobile_number — drives auto currency/plan detection at signup

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mobile_number", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "mobile_number")
