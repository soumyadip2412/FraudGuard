from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, create_model

from ml.src.preprocessing import AMOUNT, FEATURES

MAX_BATCH_SIZE = 1000

# Generated from the pipeline's feature list so the API contract can't drift from
# the model. Unknown fields (e.g. Time) are ignored; NaN/inf are rejected.
TransactionIn = create_model(
    "TransactionIn",
    __config__=ConfigDict(allow_inf_nan=False),
    **{name: (float, Field(ge=0) if name == AMOUNT else ...) for name in FEATURES},
)


class BatchIn(BaseModel):
    transactions: list[TransactionIn] = Field(min_length=1, max_length=MAX_BATCH_SIZE)


class FeatureContribution(BaseModel):
    feature: str
    value: float
    contribution: float


class PredictionOut(BaseModel):
    fraud_probability: float
    is_fraud: bool
    threshold: float
    model: str
    base_value: float | None = None
    top_features: list[FeatureContribution] | None = None


class TransactionOut(PredictionOut):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    amount: float


class TransactionList(BaseModel):
    total: int
    items: list[TransactionOut]


class ModelOut(BaseModel):
    model: str
    imbalance_strategy: str | None = None
    threshold: float
    features: list[str]
    trained_at: str | None = None
    # Held-out test-set metrics from training (PR-AUC, precision, recall, confusion counts).
    test_metrics: dict[str, float]
    max_batch_size: int


class HealthOut(BaseModel):
    status: str
    model_loaded: bool
    model: str | None = None
    threshold: float | None = None
