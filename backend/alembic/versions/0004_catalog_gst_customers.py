"""catalog items, GST settings, tax codes

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("unit", sa.String(30), nullable=True),
        sa.Column("default_unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("default_tax_rate_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_catalog_items_tenant_id", "catalog_items", ["tenant_id"])

    op.create_table(
        "tenant_gst_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("gstin", sa.String(20), nullable=True),
        sa.Column("pan", sa.String(15), nullable=True),
        sa.Column("legal_name", sa.String(255), nullable=True),
        sa.Column("place_of_supply", sa.String(100), nullable=True),
        sa.Column("default_cgst_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("default_sgst_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("default_igst_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tenant_tax_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("gst_rate_percent", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenant_tax_codes_tenant_id", "tenant_tax_codes", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_tenant_tax_codes_tenant_id", table_name="tenant_tax_codes")
    op.drop_table("tenant_tax_codes")
    op.drop_table("tenant_gst_settings")
    op.drop_index("ix_catalog_items_tenant_id", table_name="catalog_items")
    op.drop_table("catalog_items")
