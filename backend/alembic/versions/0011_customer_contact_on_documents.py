"""Customer contact details on invoices and quotations

Adds a phone number to invoices and quotations, and address to quotations
(invoices already had customer_address). All nullable: existing documents
are untouched.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("customer_phone", sa.String(50), nullable=True))
    op.add_column("quotations", sa.Column("customer_phone", sa.String(50), nullable=True))
    op.add_column("quotations", sa.Column("customer_address", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("quotations", "customer_address")
    op.drop_column("quotations", "customer_phone")
    op.drop_column("invoices", "customer_phone")
