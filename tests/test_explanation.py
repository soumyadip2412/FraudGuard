"""Explanation layer: reference statistics, contribution wording, grouping, unusualness.

Unit tests use synthetic data, so they need neither the dataset nor a trained model and
make no assumption about what any V-feature means. The last section checks the real
artifacts and is skipped when they are missing.
"""
import json
import math

import numpy as np
import pandas as pd
import pytest

from app.schemas.prediction import ExplanationOut
from ml.src.data import DATA_PATH, TARGET
from ml.src.explain import build_explanation, contribution_summary, unusualness_summary
from ml.src.preprocessing import AMOUNT, FEATURES, PCA_FEATURES
from ml.src.reference import EXTREME_RARITY, ReferenceStats
from ml.src.train import ARTIFACTS_DIR

N_LEGIT = 20_000


@pytest.fixture(scope="module")
def reference():
    rng = np.random.default_rng(0)
    legit = pd.DataFrame(rng.standard_normal((N_LEGIT, len(PCA_FEATURES))), columns=PCA_FEATURES)
    legit[AMOUNT] = np.round(rng.lognormal(3, 1.2, N_LEGIT), 2)
    legit.loc[:999, AMOUNT] = 1.0  # a block of identical values, like real round amounts
    legit[TARGET] = 0
    # Fraud rows far outside the legitimate range: they must not affect the reference.
    fraud = legit.head(50).copy()
    fraud[PCA_FEATURES] = 1_000.0
    fraud[AMOUNT] = 1e6
    fraud[TARGET] = 1
    return ReferenceStats.build(pd.concat([legit, fraud], ignore_index=True))


def median_row(reference):
    return {name: float(np.interp(0.5, reference.tables[name][1], reference.tables[name][0])) for name in FEATURES}


def contributions(v_values, amount):
    return {**dict(zip(PCA_FEATURES, v_values)), AMOUNT: amount}


def explain(reference, raw, contrib, top=None):
    return build_explanation(raw, contrib, -6.7, top or [], reference, "test-model")


# ---------- 1. Artifact generation ----------


def test_reference_uses_only_legitimate_rows(reference):
    assert reference.n == N_LEGIT
    assert reference.tables["V1"][0].max() < 10  # the 1,000.0 fraud values are absent
    assert reference.tables[AMOUNT][0].max() < 1e6


def test_quantile_tables_are_increasing_and_span_0_to_1(reference):
    for name in FEATURES:
        values, levels = reference.tables[name]
        assert np.all(np.diff(values) > 0) and np.all(np.diff(levels) > 0)
        assert levels[0] == pytest.approx(0, abs=1e-3) and levels[-1] == pytest.approx(1, abs=1e-3)


def test_save_and_load_round_trip(reference, tmp_path):
    path = tmp_path / "reference.json"
    reference.save(path)
    loaded = ReferenceStats.load(path)
    row = median_row(reference)
    assert loaded.n == reference.n
    assert loaded.percentile("V3", 0.7) == reference.percentile("V3", 0.7)
    assert loaded.unusualness_percentile(row) == reference.unusualness_percentile(row)


# ---------- 2. Percentiles ----------


def test_percentile_matches_the_distribution(reference):
    assert reference.percentile("V1", 0.0) == pytest.approx(50, abs=1.5)  # standard normal median
    assert reference.percentile("V1", 1.6449) == pytest.approx(95, abs=1)


def test_values_outside_the_observed_range_are_clamped(reference):
    assert reference.percentile("V1", -100) == 0
    assert reference.percentile("V1", 100) == 100
    assert reference.rarity("V1", -100) == 0 and reference.is_extreme("V1", 100)


def test_minimum_and_maximum_amount(reference):
    values = reference.tables[AMOUNT][0]
    assert reference.percentile(AMOUNT, 0.0) == 0  # below the smallest observed amount
    assert reference.percentile(AMOUNT, values.min()) == pytest.approx(0, abs=0.1)
    assert reference.percentile(AMOUNT, values.max()) == pytest.approx(100, abs=0.1)


def test_tied_values_get_their_mid_rank(reference):
    # 1,000 of 20,000 amounts are exactly 1.00, and ~0.6% fall below it: the block spans
    # roughly the 0.6th-5.6th percentiles, so its mid-rank is ~3%, not 0.6% or 5.6%.
    assert 2 < reference.percentile(AMOUNT, 1.0) < 4.5
    assert not reference.is_extreme(AMOUNT, 1.0)


def test_rarity_is_two_sided(reference):
    assert reference.rarity("V2", 0.0) == pytest.approx(1, abs=0.03)
    low, high = reference.rarity("V2", -2.5), reference.rarity("V2", 2.5)
    assert low == pytest.approx(high, abs=0.01) and low < 0.05


# ---------- 5. Odds multiplier and wording ----------


@pytest.mark.parametrize(
    "contribution, direction, strength",
    [(0.91, "raised", "moderate"), (-0.91, "lowered", "moderate"), (0.0, "unchanged", "negligible"),
     (0.05, "raised", "negligible"), (-0.5, "lowered", "slight"), (2.5, "raised", "strong")],
)
def test_contribution_summary(contribution, direction, strength):
    summary = contribution_summary(contribution)
    assert summary["direction"] == direction and summary["strength"] == strength
    assert summary["odds_multiplier"] == pytest.approx(math.exp(contribution))


def test_odds_multiplier_values():
    assert contribution_summary(0.91)["odds_multiplier"] == pytest.approx(2.4843, abs=1e-4)
    assert contribution_summary(0.0)["odds_multiplier"] == 1.0
    assert contribution_summary(-0.91)["odds_multiplier"] == pytest.approx(1 / 2.4843, abs=1e-4)


# ---------- 3. Amount ----------


def test_amount_explanation(reference):
    raw = median_row(reference) | {AMOUNT: 250.0}
    amount = explain(reference, raw, contributions([0.0] * 28, -0.3))["amount"]
    assert amount["value"] == 250.0
    assert amount["percentile"] == pytest.approx(reference.percentile(AMOUNT, 250.0), abs=0.01)
    assert amount["contribution"] == -0.3 and amount["direction"] == "lowered"
    assert amount["odds_multiplier"] == pytest.approx(math.exp(-0.3))


# ---------- 4. Grouped anonymised features ----------


def test_anonymised_group_sums_and_counts(reference):
    values = [0.5] * 10 + [-0.25] * 8 + [0.0] * 10
    group = explain(reference, median_row(reference), contributions(values, 0.3))["anonymised"]
    assert group["combined_contribution"] == pytest.approx(3.0)
    assert group["raised_count"] == 10 and group["lowered_count"] == 8  # zeros counted in neither
    assert group["direction"] == "raised" and group["strength"] == "strong"
    assert group["odds_multiplier"] == pytest.approx(math.exp(3.0))


def test_anonymised_group_can_lower_the_score(reference):
    group = explain(reference, median_row(reference), contributions([-0.1] * 28, 0.0))["anonymised"]
    assert group["direction"] == "lowered" and group["combined_contribution"] == pytest.approx(-2.8)


# ---------- 6. Extreme features ----------


def test_no_extreme_features(reference):
    explanation = explain(reference, median_row(reference), contributions([0.0] * 28, 0.0))
    assert explanation["anonymised"]["extreme_count"] == 0
    assert explanation["unusualness"]["extreme_feature_count"] == 0
    assert "None of the 28" in explanation["unusualness"]["summary"]


def test_some_extreme_features(reference):
    raw = median_row(reference) | {"V1": 50.0, "V2": -50.0, "V3": 50.0}
    assert explain(reference, raw, contributions([0.0] * 28, 0.0))["anonymised"]["extreme_count"] == 3


def test_many_extreme_features(reference):
    raw = {name: 50.0 for name in PCA_FEATURES} | {AMOUNT: 30.0}
    explanation = explain(reference, raw, contributions([0.1] * 28, 0.0))
    assert explanation["anonymised"]["extreme_count"] == 28
    assert "All 28" in explanation["unusualness"]["summary"]


def test_amount_is_not_counted_as_anonymised(reference):
    raw = median_row(reference) | {AMOUNT: 1e9}
    assert explain(reference, raw, contributions([0.0] * 28, 0.0))["anonymised"]["extreme_count"] == 0


# ---------- 7. Overall unusualness ----------


def test_unusualness_grows_with_distance(reference):
    centre = median_row(reference)
    # Six features 2 SDs out is moderate in 28 dimensions; all 28 at 6 SDs is beyond every reference row.
    shifted = centre | {name: 2.0 for name in PCA_FEATURES[:6]}
    far = centre | {name: 6.0 for name in PCA_FEATURES}
    scores = [reference.unusualness_percentile(row) for row in (centre, shifted, far)]
    assert scores[0] < 10 < scores[1] < 99 < scores[2] == 100


def test_unusualness_summary_wording():
    assert unusualness_summary(99.97, 6).startswith("Less typical than about 99.97% of the legitimate")
    assert unusualness_summary(100, 0).startswith("Less typical than virtually all")
    assert unusualness_summary(12.3, 0).startswith("More typical than about 87.7%")
    assert "1 of the 28 anonymised characteristics is rarer" in unusualness_summary(80, 1)
    for text in (unusualness_summary(99.97, 6), unusualness_summary(5, 0)):
        assert text.endswith("Unusual does not necessarily mean fraudulent.")


def test_unusualness_fields(reference):
    unusualness = explain(reference, median_row(reference), contributions([0.0] * 28, 0.0))["unusualness"]
    assert 0 <= unusualness["percentile"] <= 100
    assert unusualness["comparison_group"] == "legitimate transactions the model learned from"
    assert unusualness["rarity_threshold"] == EXTREME_RARITY


# ---------- Technical detail and schema ----------


def test_technical_details(reference):
    raw = median_row(reference) | {"V4": 3.0}
    top = [{"feature": "V4", "value": 3.0, "contribution": 1.2}]
    technical = explain(reference, raw, contributions([0.0] * 28, 0.0), top)["technical"]
    assert technical["base_value"] == -6.7
    assert technical["top_features"][0] == pytest.approx(
        {"feature": "V4", "value": 3.0, "contribution": 1.2, "odds_multiplier": math.exp(1.2), "percentile": reference.percentile("V4", 3.0)},
        abs=0.01,
    )
    assert set(technical["feature_percentiles"]) == set(FEATURES)
    assert top == [{"feature": "V4", "value": 3.0, "contribution": 1.2}]  # caller's list not modified


def test_explanation_matches_the_response_schema(reference):
    explanation = explain(reference, median_row(reference), contributions([0.2] * 28, 0.1))
    validated = ExplanationOut.model_validate(explanation)
    assert validated.reference.model_version == "test-model"
    assert str(N_LEGIT) in validated.reference.dataset_description.replace(",", "")


# ---------- Real artifacts (skipped without a trained model and the dataset) ----------

real_artifacts = pytest.mark.skipif(
    not (ARTIFACTS_DIR / "metadata.json").exists() or not DATA_PATH.exists(),
    reason="needs a trained model and ml/data/creditcard.csv",
)


@pytest.fixture(scope="module")
def splits():
    from ml.src.data import load_splits

    return load_splits()


@real_artifacts
def test_artifact_comes_from_legitimate_training_rows_only(splits):
    train, val, test = splits
    metadata = json.loads((ARTIFACTS_DIR / "metadata.json").read_text())
    reference = ReferenceStats.load(ARTIFACTS_DIR / metadata["reference_stats"])
    assert reference.n == int((train[TARGET] == 0).sum())
    assert reference.n != int((pd.concat([train, val, test])[TARGET] == 0).sum())


@real_artifacts
def test_predictions_are_unchanged(splits):
    """The model still reproduces the test metrics saved at training time, at the same threshold."""
    from ml.predictor import get_predictor
    from ml.src.evaluate import evaluate
    from ml.src.preprocessing import get_xy

    _, _, test = splits
    predictor = get_predictor()
    X, y = get_xy(test)
    assert evaluate(y, predictor.predict_proba(X), predictor.threshold) == predictor.metadata["test_metrics"]


@real_artifacts
def test_existing_shap_output_is_unchanged(splits):
    """top_features/base_value come from the same SHAP values the explanation summarises."""
    from ml.predictor import get_predictor
    from ml.src.explain import FraudExplainer

    _, _, test = splits
    explainer = FraudExplainer(get_predictor())
    rows = test.head(20)
    shap = explainer.shap_values(rows)
    for (_, contribution_row), result in zip(shap.iterrows(), explainer.explain(rows)):
        expected = contribution_row.reindex(contribution_row.abs().sort_values(ascending=False).index[:5])
        assert [f["feature"] for f in result["top_features"]] == list(expected.index)
        assert result["explanation"]["anonymised"]["combined_contribution"] == pytest.approx(contribution_row[PCA_FEATURES].sum())
        assert result["explanation"]["amount"]["contribution"] == pytest.approx(contribution_row[AMOUNT])
