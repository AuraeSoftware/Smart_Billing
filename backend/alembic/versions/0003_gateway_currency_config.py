"""payment gateway settings, currency exchange rates, plan feature flags

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # subscription_plans: card accent + feature flags
    op.add_column("subscription_plans", sa.Column("color", sa.String(9), nullable=False, server_default="#da1a31"))
    op.add_column("subscription_plans", sa.Column("has_priority_support", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("has_api_access", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("has_advanced_reports", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("has_multi_currency", sa.Boolean, nullable=False, server_default=sa.false()))

    # platform_payment_settings: Razorpay gateway credentials
    op.add_column("platform_payment_settings", sa.Column("razorpay_key_id", sa.String(120), nullable=True))
    op.add_column("platform_payment_settings", sa.Column("razorpay_key_secret", sa.String(255), nullable=True))
    op.add_column("platform_payment_settings", sa.Column("razorpay_webhook_secret", sa.String(255), nullable=True))

    # tenant_payment_gateways — per-tenant Razorpay credentials
    op.create_table(
        "tenant_payment_gateways",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("razorpay_key_id", sa.String(120), nullable=True),
        sa.Column("razorpay_key_secret", sa.String(255), nullable=True),
        sa.Column("razorpay_webhook_secret", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # currency_rates
    op.create_table(
        "currency_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("rate_vs_base", sa.Numeric(14, 6), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("currency", name="uq_currency_rates_currency"),
    )
    op.create_index("ix_currency_rates_currency", "currency_rates", ["currency"])

    # plan_currency_overrides
    op.create_table(
        "plan_currency_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("plan_id", "currency", name="uq_plan_currency_override"),
    )


def downgrade() -> None:
    op.drop_table("plan_currency_overrides")
    op.drop_index("ix_currency_rates_currency", table_name="currency_rates")
    op.drop_table("currency_rates")
    op.drop_table("tenant_payment_gateways")
    op.drop_column("platform_payment_settings", "razorpay_webhook_secret")
    op.drop_column("platform_payment_settings", "razorpay_key_secret")
    op.drop_column("platform_payment_settings", "razorpay_key_id")
    op.drop_column("subscription_plans", "has_multi_currency")
    op.drop_column("subscription_plans", "has_advanced_reports")
    op.drop_column("subscription_plans", "has_api_access")
    op.drop_column("subscription_plans", "has_priority_support")
    op.drop_column("subscription_plans", "color")
