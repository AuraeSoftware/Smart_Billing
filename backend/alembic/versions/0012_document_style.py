"""Document style (paper, font, colour, business details) on tenant branding

All columns are nullable: a tenant that never touches the new settings gets
the defaults applied in code (A4, Poppins, 10 pt, amber accent, shape header).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-31
"""
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenant_branding", sa.Column("doc_paper_size", sa.String(10), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_font", sa.String(20), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_font_size", sa.Integer(), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_accent_color", sa.String(9), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_header_style", sa.String(10), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_address", sa.String(500), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_phone", sa.String(50), nullable=True))
    op.add_column("tenant_branding", sa.Column("doc_registration", sa.String(200), nullable=True))


def downgrade() -> None:
    for col in ("doc_registration", "doc_phone", "doc_address", "doc_header_style", "doc_accent_color", "doc_font_size", "doc_font", "doc_paper_size"):
        op.drop_column("tenant_branding", col)
