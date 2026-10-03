import numpy as np
import pandas as pd
import shap
from sklearn.linear_model import LogisticRegression

from ml.predictor import get_predictor


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
