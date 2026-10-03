from functools import lru_cache

from app.core.config import get_settings
from ml.predictor import get_predictor
from ml.src.explain import FraudExplainer


def current_predictor():
    """Raises FileNotFoundError until a model has been trained."""
    return get_predictor(get_settings().artifact_prefix)


@lru_cache
def get_explainer():
    # lru_cache doesn't store exceptions, so a model trained after startup is
    # picked up on the next request.
    return FraudExplainer(current_predictor())


def score(transactions, explain=True):
    """transactions: list of feature dicts. Returns one result dict per transaction."""
    if explain:
        return get_explainer().explain(transactions, top_k=get_settings().explain_top_k)
    return current_predictor().predict(transactions)
