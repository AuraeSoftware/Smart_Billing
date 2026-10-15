"""SB04 — real Customer entity

Adds a genuine customers table (per tenant), a nullable customer_id FK on
invoices and quotations, and backfills it from the existing customer_name/
customer_email strings on those two tables — one Customer row per distinct
(tenant, lower(trim(name))), matching the grouping the "Customers" page
(analytics.py's tenant_customers) has always used.

Nothing existing changes shape or meaning: invoices.customer_name and
quotations.customer_name stay exactly as they were (NOT NULL, still what's
displayed and what PDFs print), customer_id is purely additive and nullable,
and the GROUP BY on the Customers page keeps working unchanged whether or
not customer_id is populated for a given row.

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_customers_tenant_id", "customers", ["tenant_id"])

    op.add_column("invoices", sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True))
    op.add_column("quotations", sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True))

    # Backfill: one customer row per tenant per distinct, trimmed/lower-cased
    # name across both invoices and quotations — same key the Customers
    # aggregation page has always grouped by. The email carried over is
    # whichever non-null one turns up first for that (tenant, name) pair.
    op.execute("""
        INSERT INTO customers (id, tenant_id, name, email, created_at, updated_at)
        SELECT gen_random_uuid(), tenant_id, name, email, now(), now()
        FROM (
            SELECT DISTINCT ON (tenant_id, lower(trim(customer_name)))
                tenant_id, trim(customer_name) AS name, customer_email AS email
            FROM (
                SELECT tenant_id, customer_name, customer_email FROM invoices
                UNION ALL
                SELECT tenant_id, customer_name, customer_email FROM quotations
            ) all_docs
            ORDER BY tenant_id, lower(trim(customer_name)), (customer_email IS NULL)
        ) dedup
    """)

    op.execute("""
        UPDATE invoices i
        SET customer_id = c.id
        FROM customers c
        WHERE c.tenant_id = i.tenant_id AND lower(trim(c.name)) = lower(trim(i.customer_name))
    """)
    op.execute("""
        UPDATE quotations q
        SET customer_id = c.id
        FROM customers c
        WHERE c.tenant_id = q.tenant_id AND lower(trim(c.name)) = lower(trim(q.customer_name))
    """)


def downgrade() -> None:
    op.drop_column("quotations", "customer_id")
    op.drop_column("invoices", "customer_id")
    op.drop_index("ix_customers_tenant_id", table_name="customers")
    op.drop_table("customers")
