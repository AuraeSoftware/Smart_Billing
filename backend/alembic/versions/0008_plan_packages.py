"""subscription_plans — package quotas (branches, products, trial length)
and feature flags for the India/Malaysia Starter/Business/Pro/Enterprise
pricing proposal. Additive only: max_invoices_per_month is relaxed to
nullable (None = unlimited, for Enterprise) rather than changed in meaning,
and every new column has a safe default so existing plan rows keep working
unchanged.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-09

"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("subscription_plans", "max_invoices_per_month", nullable=True)
    op.add_column("subscription_plans", sa.Column("trial_days", sa.Integer(), nullable=False, server_default="14"))
    op.add_column("subscription_plans", sa.Column("max_branches", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("subscription_plans", sa.Column("max_products", sa.Integer(), nullable=True))
    op.add_column("subscription_plans", sa.Column("has_employee_management", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("has_expense_tracking", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("has_multi_branch", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("subscription_plans", sa.Column("inventory_tier", sa.String(20), nullable=False, server_default="included"))
    op.add_column("subscription_plans", sa.Column("role_permissions_tier", sa.String(20), nullable=False, server_default="none"))


def downgrade() -> None:
    op.drop_column("subscription_plans", "role_permissions_tier")
    op.drop_column("subscription_plans", "inventory_tier")
    op.drop_column("subscription_plans", "has_multi_branch")
    op.drop_column("subscription_plans", "has_expense_tracking")
    op.drop_column("subscription_plans", "has_employee_management")
    op.drop_column("subscription_plans", "max_products")
    op.drop_column("subscription_plans", "max_branches")
    op.drop_column("subscription_plans", "trial_days")
    op.alter_column("subscription_plans", "max_invoices_per_month", nullable=False)
