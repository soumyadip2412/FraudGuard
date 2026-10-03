from datetime import datetime
from typing import Literal

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


Direction = Literal["raised", "lowered", "unchanged"]
Strength = Literal["negligible", "slight", "moderate", "strong"]


class AmountExplanation(BaseModel):
    value: float
    percentile: float  # 0-100, among legitimate training transactions
    contribution: float  # SHAP, log-odds
    direction: Direction
    odds_multiplier: float  # exp(contribution): factor applied to the odds, not the probability
    strength: Strength


class AnonymisedExplanation(BaseModel):
    """V1-V28 as one group: their individual meanings are unknown (anonymised by PCA)."""

    combined_contribution: float
    direction: Direction
    odds_multiplier: float
    strength: Strength
    raised_count: int
    lowered_count: int
    extreme_count: int


class UnusualnessExplanation(BaseModel):
    """How the inputs compare with legitimate training transactions. Unusual is not fraud."""

    percentile: float  # share of legitimate training transactions MORE typical than this one
    comparison_group: str
    extreme_feature_count: int
    rarity_threshold: float
    summary: str


class TechnicalFeature(FeatureContribution):
    odds_multiplier: float
    percentile: float


class TechnicalExplanation(BaseModel):
    base_value: float
    top_features: list[TechnicalFeature]
    feature_percentiles: dict[str, float]


class ExplanationReference(BaseModel):
    dataset_description: str
    model_version: str


class ExplanationOut(BaseModel):
    amount: AmountExplanation
    anonymised: AnonymisedExplanation
    unusualness: UnusualnessExplanation
    technical: TechnicalExplanation
    reference: ExplanationReference


class PredictionOut(BaseModel):
    fraud_probability: float
    is_fraud: bool
    threshold: float
    model: str
    base_value: float | None = None
    top_features: list[FeatureContribution] | None = None
    # New and optional: absent with ?explain=false or for models without reference statistics.
    explanation: ExplanationOut | None = None


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
