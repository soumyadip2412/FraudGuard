import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)


def best_f1_threshold(y_true, scores):
    """Threshold that maximizes F1. Choose it on validation data, never on test."""
    precision, recall, thresholds = precision_recall_curve(y_true, scores)
    # precision/recall have one more entry than thresholds; drop the final (recall=0) point
    f1 = 2 * precision[:-1] * recall[:-1] / np.clip(precision[:-1] + recall[:-1], 1e-12, None)
    return float(thresholds[np.argmax(f1)])


def recall_at_precision(y_true, scores, min_precision=0.9):
    precision, recall, _ = precision_recall_curve(y_true, scores)
    ok = precision >= min_precision
    return float(recall[ok].max()) if ok.any() else 0.0


def evaluate(y_true, scores, threshold=0.5):
    y_pred = (scores >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    # Accuracy is deliberately not reported: predicting "never fraud" scores 99.8%.
    return {
        "pr_auc": float(average_precision_score(y_true, scores)),
        "roc_auc": float(roc_auc_score(y_true, scores)),
        "recall_at_p90": recall_at_precision(y_true, scores, 0.9),
        "threshold": float(threshold),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "tp": int(tp),
        "fp": int(fp),
        "fn": int(fn),
        "tn": int(tn),
    }
