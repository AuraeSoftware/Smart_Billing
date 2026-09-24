"""trial-plan flag + one-per-company claims, subscription payments

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("is_trial", sa.Boolean, nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "trial_claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("company_key", sa.String(255), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("company_key", name="uq_trial_claims_company_key"),
    )
    op.create_index("ix_trial_claims_company_key", "trial_claims", ["company_key"])

    op.create_table(
        "subscription_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subscription_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False),
        sa.Column("gateway", sa.String(30), nullable=False, server_default="razorpay"),
        sa.Column("gateway_order_id", sa.String(120), nullable=False),
        sa.Column("gateway_payment_id", sa.String(120), nullable=True),
        sa.Column("gateway_signature", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="created"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_subscription_payments_tenant_id", "subscription_payments", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_subscription_payments_tenant_id", table_name="subscription_payments")
    op.drop_table("subscription_payments")
    op.drop_index("ix_trial_claims_company_key", table_name="trial_claims")
    op.drop_table("trial_claims")
    op.drop_column("subscription_plans", "is_trial")
