"""add transaction explanation

Revision ID: 1abc1a7aa2a5
Revises: a14c043f0cac
Create Date: 2026-10-03
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "1abc1a7aa2a5"
down_revision = "a14c043f0cac"
branch_labels = None
depends_on = None

JSON_COLUMN = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade():
    # Nullable: rows recorded before explanations existed simply have none.
    op.add_column("transactions", sa.Column("explanation", JSON_COLUMN, nullable=True))


def downgrade():
    op.drop_column("transactions", "explanation")
