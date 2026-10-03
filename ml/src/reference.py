"""Reference statistics for describing how unusual a transaction is.

Built once at training time from the LEGITIMATE transactions of the TRAINING split only:
- legitimate, because "unusual" should mean "unlike normal card activity" (fraud is
  0.17% of the data and would only blur that reference);
- training split only, so nothing about the validation or test transactions leaks into
  the artifact used to describe predictions.

Percentiles are empirical, read off stored quantiles, rather than z-scores: V1-V28 and
Amount are heavy-tailed (the EDA found values beyond 10 standard deviations), so a
Gaussian assumption would misstate how rare a value is.

Unusual does not mean fraudulent. These statistics compare a transaction with legitimate
ones; they don't say why the model scored it as it did (that is what SHAP is for).
"""
import json

import numpy as np

from ml.src.data import TARGET
from ml.src.preprocessing import AMOUNT, FEATURES

REFERENCE_FILE = "reference_stats.json"

# Quantile levels: every 0.1%, plus every 0.01% in each tail so that two-sided rarities
# around 1 in 1,000 can still be resolved.
LEVELS = np.unique(np.concatenate([np.linspace(0, 1, 1001), np.linspace(0, 0.001, 11), np.linspace(0.999, 1, 11)]))

# "Extremely rare": fewer than 1 in 1,000 legitimate transactions are at least as far out,
# in either tail. With 28 anonymised features, a typical transaction trips this for at
# least one feature only ~3% of the time (1 - 0.999**28); at 1 in 100 it would be ~25%.
EXTREME_RARITY = 0.001


def _quantile_table(values):
    """Empirical quantiles as (sorted values, cumulative level) pairs for interpolation.

    Equal quantile values are merged to their mean level, so a value shared by many
    transactions (e.g. Amount = 1.00) gets its mid-rank percentile, not the bottom or
    top of its block.
    """
    quantiles = np.quantile(values, LEVELS)
    unique, inverse = np.unique(quantiles, return_inverse=True)
    mid_levels = np.bincount(inverse, weights=LEVELS) / np.bincount(inverse)
    return unique, mid_levels


def _lookup(table, value):
    """Fraction (0-1) of the reference at or below value; clamps outside the observed range."""
    values, levels = table
    return float(np.interp(value, values, levels))


def _distance_space(X):
    """Rows in FEATURES order, with Amount on a log scale.

    Raw amounts span 0-25,000, so without the log a large purchase would dominate the
    distance purely through its units.
    """
    X = np.array(X, dtype=float)
    amount = FEATURES.index(AMOUNT)
    X[:, amount] = np.log1p(np.clip(X[:, amount], 0, None))
    return X


def _mahalanobis_sq(X, mean, inv_cov):
    centred = X - mean
    return np.einsum("ij,jk,ik->i", centred, inv_cov, centred)


class ReferenceStats:
    """Per-feature quantiles plus an overall distance distribution for legitimate transactions.

    Overall unusualness is the squared Mahalanobis distance from the centre of the legitimate
    transactions: a standardised distance that accounts for each feature's spread and their
    correlations. V1-V28 are PCA components and therefore nearly uncorrelated, so for them
    this is close to a sum of squared standardised values; the covariance mainly corrects for
    log-amount's correlation with them. The distance is then ranked against the same legitimate
    population. It is deliberately NOT converted to a p-value with the chi-square distribution,
    which would assume Gaussian features.
    """

    def __init__(self, tables, mean, inv_cov, distance_table, n):
        self.tables = tables
        self.mean = np.asarray(mean, dtype=float)
        self.inv_cov = np.asarray(inv_cov, dtype=float)
        self.distance_table = distance_table
        self.n = n

    @classmethod
    def build(cls, train_df):
        """Build from the training split; only its legitimate rows are used."""
        legit = train_df.loc[train_df[TARGET] == 0, FEATURES]
        tables = {name: _quantile_table(legit[name].to_numpy()) for name in FEATURES}
        X = _distance_space(legit.to_numpy())
        mean = X.mean(axis=0)
        inv_cov = np.linalg.pinv(np.cov(X, rowvar=False))
        distances = _mahalanobis_sq(X, mean, inv_cov)
        return cls(tables, mean, inv_cov, _quantile_table(distances), len(legit))

    @property
    def description(self):
        return (
            f"{self.n:,} legitimate transactions from the training split of creditcard.csv "
            "(European cardholders, September 2013)"
        )

    def percentile(self, feature, value):
        """Percentage (0-100) of legitimate training transactions with a value at or below this one."""
        return 100 * _lookup(self.tables[feature], value)

    def rarity(self, feature, value):
        """Two-sided tail probability: the share of legitimate transactions at least this far out."""
        p = _lookup(self.tables[feature], value)
        return 2 * min(p, 1 - p)

    def is_extreme(self, feature, value):
        return self.rarity(feature, value) < EXTREME_RARITY

    def unusualness_percentile(self, row):
        """Percentage (0-100) of legitimate training transactions that are MORE typical than this one."""
        X = _distance_space([[row[name] for name in FEATURES]])
        return 100 * _lookup(self.distance_table, _mahalanobis_sq(X, self.mean, self.inv_cov)[0])

    def to_dict(self):
        return {
            "population": "legitimate transactions, training split",
            "n": self.n,
            "levels_note": "values[i] is the empirical quantile at levels[i] (ties merged to their mid-level)",
            "features": {name: {"values": v.tolist(), "levels": lv.tolist()} for name, (v, lv) in self.tables.items()},
            "distance": {
                "feature_order": FEATURES,
                "mean": self.mean.tolist(),
                "inv_cov": self.inv_cov.tolist(),
                "values": self.distance_table[0].tolist(),
                "levels": self.distance_table[1].tolist(),
            },
        }

    @classmethod
    def from_dict(cls, data):
        tables = {name: (np.array(t["values"]), np.array(t["levels"])) for name, t in data["features"].items()}
        d = data["distance"]
        return cls(tables, d["mean"], d["inv_cov"], (np.array(d["values"]), np.array(d["levels"])), data["n"])

    def save(self, path):
        path.write_text(json.dumps(self.to_dict()))

    @classmethod
    def load(cls, path):
        return cls.from_dict(json.loads(path.read_text()))


def write_reference(prefix=""):
    """Build the artifact for an already-trained model without retraining it.

    The training split is deterministic (fixed seed), so this reproduces exactly the
    rows the model was trained on. Only the reference_stats key is added to metadata.
    """
    from ml.src.data import load_splits
    from ml.src.train import ARTIFACTS_DIR

    metadata_path = ARTIFACTS_DIR / f"{prefix}metadata.json"
    metadata = json.loads(metadata_path.read_text())
    train, _, _ = load_splits()
    reference = ReferenceStats.build(train)
    reference.save(ARTIFACTS_DIR / f"{prefix}{REFERENCE_FILE}")
    metadata["reference_stats"] = f"{prefix}{REFERENCE_FILE}"
    metadata_path.write_text(json.dumps(metadata, indent=2))
    print(f"Wrote {prefix}{REFERENCE_FILE}: {reference.description}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build reference statistics for an existing model.")
    parser.add_argument("--prefix", default="", help='artifact prefix, e.g. "logreg_"')
    write_reference(parser.parse_args().prefix)
