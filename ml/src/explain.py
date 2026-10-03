import numpy as np
import pandas as pd
import shap
from sklearn.linear_model import LogisticRegression

from ml.predictor import get_predictor
from ml.src.preprocessing import AMOUNT, FEATURES, PCA_FEATURES
from ml.src.reference import EXTREME_RARITY

# Wording buckets for the size of a SHAP contribution in log-odds. These are presentation
# conventions, not statistical tests: |c| < 0.1 changes the odds by less than ~10%,
# 0.7 roughly doubles them, 2.0 multiplies them by ~7.
STRENGTHS = ((0.1, "negligible"), (0.7, "slight"), (2.0, "moderate"))

COMPARISON_GROUP = "legitimate transactions the model learned from"


def contribution_summary(contribution):
    """Direction, odds multiplier and strength wording for one SHAP contribution.

    SHAP values for these models are in log-odds, so exp(contribution) is the factor by
    which the contribution multiplied the ODDS of fraud, p / (1 - p). It is not a
    probability multiplier: x2.5 takes 1% to about 2.5%, but takes 50% to 71%, not 125%.
    """
    contribution = float(contribution)
    direction = "raised" if contribution > 0 else "lowered" if contribution < 0 else "unchanged"
    size = abs(contribution)
    strength = next((label for limit, label in STRENGTHS if size < limit), "strong")
    return {"contribution": contribution, "direction": direction, "odds_multiplier": float(np.exp(contribution)), "strength": strength}


def _share(percentile):
    """'about 92.6%', two decimals near the top where the tail matters, 'virtually all' at the edge."""
    if percentile >= 99.995:
        return "virtually all"
    return f"about {percentile:.2f}%" if percentile >= 99 else f"about {percentile:.1f}%"


def unusualness_summary(percentile, extreme_count):
    """One plain-language rarity line. It describes unusualness only, never fraud."""
    if percentile >= 50:
        overall = f"Less typical than {_share(percentile)} of the {COMPARISON_GROUP}."
    else:
        overall = f"More typical than {_share(100 - percentile)} of the {COMPARISON_GROUP}."
    total = len(PCA_FEATURES)
    if extreme_count == 0:
        rare = f"None of the {total} anonymised characteristics is rarer than 1 in {round(1 / EXTREME_RARITY):,} of them."
    elif extreme_count == total:
        rare = f"All {total} anonymised characteristics are rarer than 1 in {round(1 / EXTREME_RARITY):,} of them."
    else:
        verb = "is" if extreme_count == 1 else "are"
        rare = f"{extreme_count} of the {total} anonymised characteristics {verb} rarer than 1 in {round(1 / EXTREME_RARITY):,} of them."
    return f"{overall} {rare} Unusual does not necessarily mean fraudulent."


def _amount_part(raw, contributions, reference):
    return {
        "value": float(raw[AMOUNT]),
        "percentile": round(reference.percentile(AMOUNT, raw[AMOUNT]), 2),
        **contribution_summary(contributions[AMOUNT]),
    }


def _anonymised_part(raw, contributions, reference):
    """V1-V28 as ONE group.

    Their original meaning was removed by the card issuer (PCA), so naming or ranking them
    individually tells a user nothing true. SHAP contributions are additive, so their sum
    is the exact combined effect of the anonymised characteristics on the score.
    """
    values = [float(contributions[name]) for name in PCA_FEATURES]
    summary = contribution_summary(sum(values))
    return {
        "combined_contribution": summary.pop("contribution"),
        **summary,
        "raised_count": sum(v > 0 for v in values),
        "lowered_count": sum(v < 0 for v in values),
        "extreme_count": sum(reference.is_extreme(name, raw[name]) for name in PCA_FEATURES),
    }


def _technical_part(raw, base_value, top_features, reference):
    """Per-feature SHAP detail for developers and analysts; not a semantic explanation."""
    return {
        "base_value": base_value,
        "top_features": [
            {
                **feature,
                "odds_multiplier": float(np.exp(feature["contribution"])),
                "percentile": round(reference.percentile(feature["feature"], feature["value"]), 2),
            }
            for feature in top_features
        ],
        "feature_percentiles": {name: round(reference.percentile(name, raw[name]), 2) for name in FEATURES},
    }


def build_explanation(raw, contributions, base_value, top_features, reference, model_version):
    """The user-facing explanation object, built from one transaction's existing SHAP values.

    raw and contributions map each feature name to its input value and SHAP contribution.
    Nothing here changes the prediction or the SHAP values; it only summarises them and
    compares the inputs with legitimate training transactions.
    """
    anonymised = _anonymised_part(raw, contributions, reference)
    percentile = reference.unusualness_percentile(raw)
    return {
        "amount": _amount_part(raw, contributions, reference),
        "anonymised": anonymised,
        "unusualness": {
            "percentile": round(percentile, 2),
            "comparison_group": COMPARISON_GROUP,
            "extreme_feature_count": anonymised["extreme_count"],
            "rarity_threshold": EXTREME_RARITY,
            "summary": unusualness_summary(percentile, anonymised["extreme_count"]),
        },
        "technical": _technical_part(raw, base_value, top_features, reference),
        "reference": {"dataset_description": reference.description, "model_version": model_version},
    }


class FraudExplainer:
    """SHAP explanations for a FraudPredictor's model.

    SHAP splits one prediction into per-feature contributions that add up to the
    model's output: base_value + sum(contributions) = log-odds of fraud. A positive
    contribution pushed the transaction towards "fraud", a negative one away from it.
    """

    def __init__(self, predictor=None, background=None):
        self.predictor = predictor or get_predictor()
        self.preprocess = self.predictor.pipeline.named_steps["preprocess"]
        model = self.predictor.pipeline.named_steps["model"]

        if isinstance(model, LogisticRegression):
            # Linear SHAP measures each feature against an average transaction,
            # so it needs reference data (a sample of training rows).
            if background is None:
                raise ValueError("Logistic regression needs background data to explain")
            self.explainer = shap.LinearExplainer(model, self._transform(background))
        else:
            # Tree SHAP is exact and reads the reference distribution from the trees.
            self.explainer = shap.TreeExplainer(model)

    def _transform(self, transactions):
        # SHAP explains the model step, so it sees the same scaled features the model does.
        return self.preprocess.transform(self.predictor.to_frame(transactions))

    def shap_values(self, transactions):
        values = self.explainer.shap_values(self._transform(transactions))
        return pd.DataFrame(values, columns=self.predictor.features)

    def explain(self, transactions, top_k=5):
        """Prediction plus the top_k features that drove it, per transaction."""
        X = self.predictor.to_frame(transactions)
        contributions = self.shap_values(X)
        base_value = float(np.ravel(self.explainer.expected_value)[0])

        results = self.predictor.predict(X)
        for result, (_, raw), (_, row) in zip(results, X.iterrows(), contributions.iterrows()):
            top = row.reindex(row.abs().sort_values(ascending=False).index[:top_k])
            result["base_value"] = base_value
            result["top_features"] = [
                {"feature": name, "value": float(raw[name]), "contribution": float(shap_value)}
                for name, shap_value in top.items()
            ]
            # Added alongside the existing fields; None for models without reference statistics.
            reference = self.predictor.reference
            result["explanation"] = (
                build_explanation(raw, row, base_value, result["top_features"], reference, self.predictor.model_version)
                if reference
                else None
            )
        return results

    def global_importance(self, transactions):
        """Mean |SHAP| per feature: how much each feature moves predictions on average."""
        return self.shap_values(transactions).abs().mean().sort_values(ascending=False)


if __name__ == "__main__":
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    from ml.src.data import TARGET, load_splits
    from ml.src.train import ARTIFACTS_DIR

    _, val, test = load_splits()
    explainer = FraudExplainer()

    sample = pd.concat([test[test[TARGET] == 1].head(2), test[test[TARGET] == 0].head(1)])
    for actual, result in zip(sample[TARGET], explainer.explain(sample)):
        print(f"\nactual={actual}  p={result['fraud_probability']:.4f}  flagged={result['is_fraud']}"
              f"  base={result['base_value']:.2f}")
        for f in result["top_features"]:
            print(f"  {f['feature']:<7} value={f['value']:>9.2f}  contribution={f['contribution']:+.3f}")

    # All val frauds plus a legit sample, so importance reflects both classes.
    background = pd.concat([val[val[TARGET] == 1], val[val[TARGET] == 0].sample(5000, random_state=0)])
    importance = explainer.global_importance(background)
    print("\nGlobal importance (mean |SHAP|):")
    print(importance.head(10).round(3).to_string())

    ax = importance.head(15).iloc[::-1].plot.barh(figsize=(7, 5))
    ax.set_xlabel("mean |SHAP| (log-odds)")
    ax.set_title(f"Feature importance - {explainer.predictor.model_name}")
    plt.tight_layout()
    out = ARTIFACTS_DIR / "shap_importance.png"
    plt.savefig(out, dpi=120)
    print(f"Saved {out}")
