import math
import os
import tempfile

# Point the app at a throwaway database before anything imports db.session.
# Set TEST_DATABASE_URL to run against a dedicated PostgreSQL test database instead.
_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["API_KEY"] = ""

import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.prediction import MAX_BATCH_SIZE  # noqa: E402
from ml.src.data import DATA_PATH, TARGET  # noqa: E402
from ml.src.preprocessing import FEATURES  # noqa: E402
from ml.src.train import ARTIFACTS_DIR  # noqa: E402

pytestmark = pytest.mark.skipif(
    not (ARTIFACTS_DIR / "model.joblib").exists() or not DATA_PATH.exists(),
    reason="needs a trained model and ml/data/creditcard.csv",
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # "with" runs the startup (lifespan) code
        yield c


@pytest.fixture(scope="module")
def rows():
    df = pd.read_csv(DATA_PATH, nrows=5000)
    pick = lambda cls: df[df[TARGET] == cls].iloc[0][FEATURES].to_dict()  # noqa: E731
    return {"fraud": pick(1), "legit": pick(0)}


def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200 and resp.json()["message"] == "FraudGuard API is running"


def test_health(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["model_loaded"] and body["model"] == "xgboost"


def test_model_info(client):
    body = client.get("/model").json()
    assert body["features"] == FEATURES and 0 < body["threshold"] < 1
    assert "pr_auc" in body["test_metrics"] and body["max_batch_size"] == MAX_BATCH_SIZE


def test_predict_flags_fraud_with_reasons(client, rows):
    body = client.post("/predictions", json=rows["fraud"]).json()
    assert body["is_fraud"] and body["fraud_probability"] > body["threshold"]
    assert len(body["top_features"]) == get_settings().explain_top_k


def test_predict_legit_without_explanation(client, rows):
    body = client.post("/predictions?explain=false", json=rows["legit"]).json()
    assert not body["is_fraud"] and body["top_features"] is None and body["explanation"] is None


def test_existing_response_fields_are_unchanged(client, rows):
    body = client.post("/predictions", json=rows["fraud"]).json()
    assert {"fraud_probability", "is_fraud", "threshold", "model", "base_value", "top_features"} <= body.keys()
    assert all(set(f) == {"feature", "value", "contribution"} for f in body["top_features"])


def test_prediction_includes_explanation(client, rows):
    body = client.post("/predictions", json=rows["fraud"]).json()
    explanation = body["explanation"]
    assert set(explanation) == {"amount", "anonymised", "unusualness", "technical", "reference"}
    assert explanation["amount"]["value"] == rows["fraud"]["Amount"]
    group = explanation["anonymised"]
    assert group["raised_count"] + group["lowered_count"] <= 28
    assert 0 <= explanation["unusualness"]["percentile"] <= 100
    # Technical detail mirrors the existing top_features, plus odds and percentile.
    technical = explanation["technical"]
    assert technical["base_value"] == body["base_value"]
    assert [(f["feature"], f["contribution"]) for f in technical["top_features"]] == [
        (f["feature"], f["contribution"]) for f in body["top_features"]
    ]
    # SHAP additivity: base + amount + anonymised group = the model's log-odds.
    log_odds = technical["base_value"] + explanation["amount"]["contribution"] + group["combined_contribution"]
    assert 1 / (1 + math.exp(-log_odds)) == pytest.approx(body["fraud_probability"], abs=1e-4)


def test_recorded_transaction_keeps_its_explanation(client, rows):
    created = client.post("/transactions", json=rows["legit"]).json()
    assert created["explanation"]["amount"]["value"] == rows["legit"]["Amount"]
    fetched = client.get(f"/transactions/{created['id']}").json()
    assert fetched["explanation"] == created["explanation"]


@pytest.mark.parametrize("change", [{"Amount": -5}, {"V3": None}, {"V3": "abc"}])
def test_invalid_input_rejected(client, rows, change):
    assert client.post("/predictions", json={**rows["legit"], **change}).status_code == 422


def test_missing_field_rejected(client, rows):
    payload = {k: v for k, v in rows["legit"].items() if k != "V14"}
    assert client.post("/predictions", json=payload).status_code == 422


def test_batch(client, rows):
    resp = client.post("/predictions/batch", json={"transactions": [rows["fraud"], rows["legit"]]})
    assert [r["is_fraud"] for r in resp.json()] == [True, False]
    assert client.post("/predictions/batch", json={"transactions": []}).status_code == 422


def test_transaction_lifecycle(client, rows):
    created = client.post("/transactions", json=rows["fraud"])
    assert created.status_code == 201
    txn = created.json()
    assert txn["is_fraud"] and txn["amount"] == rows["fraud"]["Amount"] and txn["top_features"]

    client.post("/transactions", json=rows["legit"])
    assert client.get(f"/transactions/{txn['id']}").json()["id"] == txn["id"]

    frauds = client.get("/transactions?is_fraud=true").json()
    assert frauds["total"] >= 1 and all(t["is_fraud"] for t in frauds["items"])
    assert client.get("/transactions?limit=1").json()["total"] >= 2
    assert client.get("/transactions/999999").status_code == 404


def test_api_key_enforced(client, rows, monkeypatch):
    monkeypatch.setattr(get_settings(), "api_key", "secret")
    assert client.post("/predictions", json=rows["legit"]).status_code == 401
    assert client.post("/predictions", json=rows["legit"], headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post("/predictions", json=rows["legit"], headers={"X-API-Key": "secret"}).status_code == 200
    assert client.get("/health").status_code == 200  # health stays open
    assert client.get("/").status_code == 200
