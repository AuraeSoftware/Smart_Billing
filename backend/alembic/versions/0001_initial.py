"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # create_type=False on every one of these: they're created explicitly,
    # once, right below. Without it, SQLAlchemy also auto-creates the type
    # a second time as a side effect of op.create_table() (it fires a
    # before_create event on any table with an enum column), and that
    # second attempt always fails with "type already exists" -- on any
    # database, every single run, regardless of whether the schema was
    # reset beforehand.
    subscription_status = postgresql.ENUM(
        "pending_onboarding", "active", "suspended", "cancelled",
        name="subscriptionstatus", create_type=False,
    )
    user_role = postgresql.ENUM(
        "supreme_admin", "super_admin", "tenant_user",
        name="userrole", create_type=False,
    )
    device_event_type = postgresql.ENUM(
        "registered", "login_blocked_other_device", "deregistered", "re_registered",
        "suspended_by_supreme_admin", "reactivated_by_supreme_admin",
        name="deviceeventtype", create_type=False,
    )
    invoice_status = postgresql.ENUM(
        "draft", "sent", "viewed", "paid", "partially_paid", "overdue", "cancelled",
        name="invoicestatus", create_type=False,
    )
    quotation_status = postgresql.ENUM(
        "draft", "sent", "accepted", "declined", "expired", "converted",
        name="quotationstatus", create_type=False,
    )

    bind = op.get_bind()
    subscription_status.create(bind, checkfirst=True)
    user_role.create(bind, checkfirst=True)
    device_event_type.create(bind, checkfirst=True)
    invoice_status.create(bind, checkfirst=True)
    quotation_status.create(bind, checkfirst=True)

    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("subscription_status", subscription_status, nullable=False, server_default="pending_onboarding"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_tenants_slug", "tenants", ["slug"])

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_suspended", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "device_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("device_token", sa.String(255), nullable=False),
        sa.Column("device_label", sa.String(255), nullable=True),
        sa.Column("active_session_token", sa.String(255), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_device_sessions_user_id", "device_sessions", ["user_id"])

    op.create_table(
        "device_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("event_type", device_event_type, nullable=False),
        sa.Column("device_label", sa.String(255), nullable=True),
        sa.Column("detail", sa.String(500), nullable=True),
        sa.Column("acknowledged", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_device_events_user_id", "device_events", ["user_id"])
    op.create_index("ix_device_events_tenant_id", "device_events", ["tenant_id"])

    op.create_table(
        "tenant_branding",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("header_url", sa.String(500), nullable=True),
        sa.Column("footer_url", sa.String(500), nullable=True),
        sa.Column("footer_text", sa.String(2000), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "document_counters",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("doc_type", sa.String(20), nullable=False),
        sa.Column("financial_year", sa.String(9), nullable=False),
        sa.Column("prefix", sa.String(20), server_default=""),
        sa.Column("last_sequence", sa.Integer, server_default="0"),
    )
    op.create_index("ix_document_counters_tenant_id", "document_counters", ["tenant_id"])

    op.create_table(
        "quotations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("valid_until", sa.Date, nullable=True),
        sa.Column("status", quotation_status, server_default="draft"),
        sa.Column("revision", sa.Integer, server_default="1"),
        sa.Column("subtotal", sa.Numeric(12, 2), server_default="0"),
        sa.Column("tax_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("discount_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("grand_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_quotations_tenant_id", "quotations", ["tenant_id"])

    op.create_table(
        "quotation_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("quotation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 2), server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), server_default="0"),
        sa.Column("tax_rate_percent", sa.Numeric(5, 2), server_default="0"),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0"),
        sa.Column("line_total", sa.Numeric(12, 2), server_default="0"),
    )

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("customer_address", sa.Text, nullable=True),
        sa.Column("issue_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("status", invoice_status, server_default="draft"),
        sa.Column("subtotal", sa.Numeric(12, 2), server_default="0"),
        sa.Column("tax_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("discount_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("grand_total", sa.Numeric(12, 2), server_default="0"),
        sa.Column("amount_paid", sa.Numeric(12, 2), server_default="0"),
        sa.Column("source_quotation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotations.id"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invoices_tenant_id", "invoices", ["tenant_id"])

    op.create_table(
        "invoice_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 2), server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), server_default="0"),
        sa.Column("tax_rate_percent", sa.Numeric(5, 2), server_default="0"),
        sa.Column("discount_percent", sa.Numeric(5, 2), server_default="0"),
        sa.Column("line_total", sa.Numeric(12, 2), server_default="0"),
    )

    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_partial", sa.Boolean, server_default=sa.false()),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("payment_reference", sa.String(255), nullable=True),
        sa.Column("received_at", sa.Date, nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_receipts_tenant_id", "receipts", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("receipts")
    op.drop_table("invoice_items")
    op.drop_table("invoices")
    op.drop_table("quotation_items")
    op.drop_table("quotations")
    op.drop_table("document_counters")
    op.drop_table("tenant_branding")
    op.drop_table("device_events")
    op.drop_table("device_sessions")
    op.drop_table("users")
    op.drop_table("tenants")

    bind = op.get_bind()
    postgresql.ENUM(name="quotationstatus").drop(bind, checkfirst=True)
    postgresql.ENUM(name="invoicestatus").drop(bind, checkfirst=True)
    postgresql.ENUM(name="deviceeventtype").drop(bind, checkfirst=True)
    postgresql.ENUM(name="userrole").drop(bind, checkfirst=True)
    postgresql.ENUM(name="subscriptionstatus").drop(bind, checkfirst=True)
