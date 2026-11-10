"""GST Manager: address, phone, email, TIN / SSM

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-10
"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_gst_settings", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("tenant_gst_settings", sa.Column("phone", sa.String(30), nullable=True))
    op.add_column("tenant_gst_settings", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("tenant_gst_settings", sa.Column("tax_id", sa.String(60), nullable=True))


def downgrade() -> None:
    for c in ("tax_id", "email", "phone", "address"):
        op.drop_column("tenant_gst_settings", c)
