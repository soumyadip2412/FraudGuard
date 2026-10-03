import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd

from ml.src.preprocessing import validate_input
from ml.src.train import ARTIFACTS_DIR


class FraudPredictor:
    """Loads a trained pipeline plus its metadata and scores raw transactions.

    The saved pipeline already contains the preprocessing, so callers pass raw
    columns (V1-V28, Amount). The fraud decision uses the threshold chosen on
    validation during training, not 0.5.
    """

    def __init__(self, prefix=""):
        model_path = ARTIFACTS_DIR / f"{prefix}model.joblib"
        metadata_path = ARTIFACTS_DIR / f"{prefix}metadata.json"
        if not model_path.exists() or not metadata_path.exists():
            raise FileNotFoundError(
                f"No trained model at {model_path}; run `python -m ml.src.train` first"
            )

        self.pipeline = joblib.load(model_path)
        self.metadata = json.loads(metadata_path.read_text())
        self.features = self.metadata["features"]
        self.threshold = self.metadata["threshold"]
        self.model_name = self.metadata["model"]

    def to_frame(self, transactions):
        if isinstance(transactions, pd.DataFrame):
            X = transactions
        elif isinstance(transactions, dict):
            X = pd.DataFrame([transactions])
        else:
            X = pd.DataFrame(list(transactions))
        validate_input(X)
        # Fixed column order; extra input columns (e.g. Time, an id) are ignored.
        return X[self.features]

    def predict_proba(self, transactions):
        return self.pipeline.predict_proba(self.to_frame(transactions))[:, 1]

    def predict(self, transactions):
        """Accepts one transaction dict, a list of dicts, or a DataFrame.

        Returns one result dict per transaction.
        """
        scores = self.predict_proba(transactions)
        return [
            {
                "fraud_probability": float(score),
                "is_fraud": bool(score >= self.threshold),
                "threshold": self.threshold,
                "model": self.model_name,
            }
            for score in np.atleast_1d(scores)
        ]


@lru_cache
def get_predictor(prefix=""):
    """Shared instance so the model is loaded from disk once per process."""
    return FraudPredictor(prefix)


if __name__ == "__main__":
    from ml.src.data import TARGET, load_splits

    _, _, test = load_splits()
    predictor = get_predictor()
    sample = pd.concat([test[test[TARGET] == 1].head(3), test[test[TARGET] == 0].head(3)])

    print(f"model={predictor.model_name}  threshold={predictor.threshold:.4f}")
    for actual, result in zip(sample[TARGET], predictor.predict(sample)):
        print(f"actual={actual}  p={result['fraud_probability']:.4f}  flagged={result['is_fraud']}")

    one = sample.iloc[0].drop(TARGET).to_dict()
    print("single dict:", predictor.predict(one)[0])
