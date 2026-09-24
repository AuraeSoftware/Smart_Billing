"""subscription plans, subscription history, payment settings, tenant currency/plan

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # subscription_plans — no ENUM columns at all (billing_cycle is a plain
    # String), so none of the double-create-on-table-creation handling 0001
    # needs is required here.
    op.create_table(
        "subscription_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("currency", sa.String(10), nullable=False, server_default="INR"),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("billing_cycle", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("max_users", sa.Integer, nullable=False, server_default="5"),
        sa.Column("max_invoices_per_month", sa.Integer, nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # tenants: currency + plan link
    op.add_column("tenants", sa.Column("currency", sa.String(10), nullable=False, server_default="INR"))
    op.add_column("tenants", sa.Column("subscription_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True))

    # tenant_subscription_events — audit log, plain String event_type
    op.create_table(
        "tenant_subscription_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("old_value", sa.String(255), nullable=True),
        sa.Column("new_value", sa.String(255), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("changed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_by_label", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenant_subscription_events_tenant_id", "tenant_subscription_events", ["tenant_id"])

    # platform_payment_settings — singleton row, created lazily by the app
    op.create_table(
        "platform_payment_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("bank_name", sa.String(255), nullable=True),
        sa.Column("account_name", sa.String(255), nullable=True),
        sa.Column("account_number", sa.String(64), nullable=True),
        sa.Column("ifsc_code", sa.String(32), nullable=True),
        sa.Column("upi_id", sa.String(120), nullable=True),
        sa.Column("supported_gateways", sa.String(255), nullable=True),
        sa.Column("notes", sa.String(1000), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("platform_payment_settings")
    op.drop_index("ix_tenant_subscription_events_tenant_id", table_name="tenant_subscription_events")
    op.drop_table("tenant_subscription_events")
    op.drop_column("tenants", "subscription_plan_id")
    op.drop_column("tenants", "currency")
    op.drop_table("subscription_plans")
