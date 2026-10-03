"""create transactions table

Revision ID: a14c043f0cac
Revises:
Create Date: 2026-10-03 21:10:47.132116
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a14c043f0cac"
down_revision = None
branch_labels = None
depends_on = None

JSON_COLUMN = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade():
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("features", JSON_COLUMN, nullable=False),
        sa.Column("amount", sa.Double(), nullable=False),
        sa.Column("fraud_probability", sa.Double(), nullable=False),
        sa.Column("is_fraud", sa.Boolean(), nullable=False),
        sa.Column("threshold", sa.Double(), nullable=False),
        sa.Column("model", sa.String(length=50), nullable=False),
        sa.Column("base_value", sa.Double(), nullable=True),
        sa.Column("top_features", JSON_COLUMN, nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_created_at", "transactions", ["created_at"])
    op.create_index("ix_transactions_is_fraud", "transactions", ["is_fraud"])


def downgrade():
    op.drop_index("ix_transactions_is_fraud", table_name="transactions")
    op.drop_index("ix_transactions_created_at", table_name="transactions")
    op.drop_table("transactions")
