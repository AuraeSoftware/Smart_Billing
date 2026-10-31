"""Plan expiry + upgrade requests

Adds tenants.plan_expires_at (nullable: existing workspaces keep working with
no expiry) and the plan_upgrade_requests table. Existing active free-trial
workspaces get a fresh trial window starting today so none lock out the day
this ships.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-31
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("plan_expires_at", sa.Date(), nullable=True))
    op.create_table(
        "plan_upgrade_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_plan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("subscription_plans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("decision_note", sa.String(500), nullable=True),
        sa.Column("requested_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_plan_upgrade_requests_tenant_id", "plan_upgrade_requests", ["tenant_id"])
    op.create_index("ix_plan_upgrade_requests_status", "plan_upgrade_requests", ["status"])
    op.execute("""
        UPDATE tenants t
        SET plan_expires_at = CURRENT_DATE + p.trial_days
        FROM subscription_plans p
        WHERE t.subscription_plan_id = p.id
          AND p.is_trial = TRUE
          AND t.subscription_status = 'active'
          AND t.plan_expires_at IS NULL
    """)


def downgrade() -> None:
    op.drop_index("ix_plan_upgrade_requests_status", table_name="plan_upgrade_requests")
    op.drop_index("ix_plan_upgrade_requests_tenant_id", table_name="plan_upgrade_requests")
    op.drop_table("plan_upgrade_requests")
    op.drop_column("tenants", "plan_expires_at")
