from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from db.session import Base

# JSONB on PostgreSQL (binary, indexable, queryable); plain JSON elsewhere (SQLite in tests).
JsonColumn = JSON().with_variant(JSONB(), "postgresql")


class Transaction(Base):
    """A scored transaction: its inputs plus the decision made at the time."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    # Raw model inputs (V1-V28, Amount), kept so a decision can be audited or re-scored.
    features: Mapped[dict] = mapped_column(JsonColumn)
    amount: Mapped[float]
    fraud_probability: Mapped[float]
    is_fraud: Mapped[bool] = mapped_column(index=True)
    # Threshold and model are stored per row because both change when the model is retrained.
    threshold: Mapped[float]
    model: Mapped[str] = mapped_column(String(50))
    base_value: Mapped[float | None]
    top_features: Mapped[list | None] = mapped_column(JsonColumn)
