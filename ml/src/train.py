import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier

from ml.src.data import RANDOM_STATE, load_splits
from ml.src.evaluate import best_f1_threshold, evaluate
from ml.src.preprocessing import FEATURES, build_preprocessor, get_xy
from ml.src.reference import REFERENCE_FILE, ReferenceStats

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"

MODELS = ("logreg", "xgboost")

# Imbalance strategies. They are alternatives, never combined: SMOTE plus class
# weights would count the minority class twice.
#   none         - reference point, shows how much each strategy actually helps
#   class_weight - reweight the loss; no new data, fast, no synthetic noise
#   smote        - synthesize frauds by interpolating between fraud neighbours
STRATEGIES = ("none", "class_weight", "smote")

# Oversample frauds to 1 per 10 legit rows rather than 1:1. Full balancing would
# mean ~198k synthetic rows interpolated from 331 real frauds - mostly noise.
SMOTE_RATIO = 0.1

# Inverse regularization strength searched for logistic regression (selected on val).
# Smaller C = stronger L2 penalty, which matters with only ~330 training frauds.
LOGREG_C = (0.001, 0.01, 0.1, 1.0)


def param_grid(name):
    return [{"C": c} for c in LOGREG_C] if name == "logreg" else [{}]


def build_model(name, strategy, y_train, params=None):
    neg, pos = int((y_train == 0).sum()), int((y_train == 1).sum())
    params = params or {}

    if name == "logreg":
        clf = LogisticRegression(
            C=params.get("C", 1.0),
            class_weight="balanced" if strategy == "class_weight" else None,
            max_iter=1000,
            random_state=RANDOM_STATE,
        )
    elif name == "xgboost":
        clf = XGBClassifier(
            n_estimators=400,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            tree_method="hist",
            eval_metric="aucpr",
            scale_pos_weight=neg / pos if strategy == "class_weight" else 1.0,
            n_jobs=-1,
            random_state=RANDOM_STATE,
        )
    else:
        raise ValueError(f"Unknown model: {name}")

    steps: list = [("preprocess", build_preprocessor())]
    if strategy == "smote":
        # SMOTE runs after scaling (its k-NN needs comparable feature scales) and,
        # inside an imblearn Pipeline, only during fit - never on val/test/live data.
        steps.append(("smote", SMOTE(sampling_strategy=SMOTE_RATIO, k_neighbors=5, random_state=RANDOM_STATE)))
    steps.append(("model", clf))
    return Pipeline(steps)


def run_experiments(train, val, models=MODELS):
    X_train, y_train = get_xy(train)
    X_val, y_val = get_xy(val)

    results, fitted = [], []
    for name in models:
        for strategy in STRATEGIES:
            for params in param_grid(name):
                pipeline = build_model(name, strategy, y_train, params).fit(X_train, y_train)
                scores = pipeline.predict_proba(X_val)[:, 1]
                threshold = best_f1_threshold(y_val, scores)
                metrics = evaluate(y_val, scores, threshold)

                results.append({"model": name, "strategy": strategy, "params": json.dumps(params), **metrics})
                fitted.append((pipeline, threshold))
                print(f"{name:<8} {strategy:<13} {json.dumps(params):<14} PR-AUC={metrics['pr_auc']:.4f}  F1={metrics['f1']:.4f}")

    return results, fitted


def artifact_prefix(models):
    # A full run owns the default artifact names; a partial run (e.g. logreg only)
    # writes alongside them instead of replacing the overall best model.
    return "" if set(models) == set(MODELS) else "_".join(models) + "_"


def save(pipeline, threshold, name, strategy, params, val_metrics, test_metrics, reference, prefix=""):
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, ARTIFACTS_DIR / f"{prefix}model.joblib")
    reference.save(ARTIFACTS_DIR / f"{prefix}{REFERENCE_FILE}")
    metadata = {
        "model": name,
        "params": params,
        "imbalance_strategy": strategy,
        "smote_ratio": SMOTE_RATIO if strategy == "smote" else None,
        "threshold": threshold,
        "features": FEATURES,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "val_metrics": val_metrics,
        "test_metrics": test_metrics,
        # Legitimate training transactions, used to describe how unusual inputs are.
        "reference_stats": f"{prefix}{REFERENCE_FILE}",
    }
    (ARTIFACTS_DIR / f"{prefix}metadata.json").write_text(json.dumps(metadata, indent=2))


def main(models=MODELS):
    prefix = artifact_prefix(models)
    train, val, test = load_splits()
    results, fitted = run_experiments(train, val, models)
    table = pd.DataFrame(results).sort_values("pr_auc", ascending=False)

    cols = ["model", "strategy", "params", "pr_auc", "roc_auc", "recall_at_p90", "precision", "recall", "f1", "tp", "fp", "fn"]
    print("\nValidation results (threshold = best F1 on val):")
    print(table[cols].to_string(index=False, float_format="%.4f"))
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    table.to_csv(ARTIFACTS_DIR / f"{prefix}experiments.csv", index=False)

    # Select on validation PR-AUC; test is touched exactly once, for the winner.
    best_idx = max(range(len(results)), key=lambda i: results[i]["pr_auc"])
    best = results[best_idx]
    pipeline, threshold = fitted[best_idx]
    X_test, y_test = get_xy(test)
    test_metrics = evaluate(y_test, pipeline.predict_proba(X_test)[:, 1], threshold)

    print(f"\nSelected: {best['model']} + {best['strategy']} {best['params']} (threshold={threshold:.4f})")
    print("Test:", {k: round(v, 4) if isinstance(v, float) else v for k, v in test_metrics.items()})

    val_metrics = {k: best[k] for k in test_metrics}
    reference = ReferenceStats.build(train)  # training split only: no val/test leakage
    save(pipeline, threshold, best["model"], best["strategy"], json.loads(best["params"]), val_metrics, test_metrics, reference, prefix)
    print(f"Saved model and metadata to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and compare fraud models.")
    parser.add_argument("--models", nargs="+", choices=MODELS, default=list(MODELS))
    main(tuple(parser.parse_args().models))
