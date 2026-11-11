"""subscription_payments.upgrade_request_id

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_payments", sa.Column("upgrade_request_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_subscription_payments_upgrade_request", "subscription_payments", "plan_upgrade_requests",
        ["upgrade_request_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_subscription_payments_upgrade_request", "subscription_payments", type_="foreignkey")
    op.drop_column("subscription_payments", "upgrade_request_id")
