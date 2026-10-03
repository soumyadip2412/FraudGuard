# FraudGuard

Credit-card fraud detection, end to end: a gradient-boosted model trained on 284,807 real card
transactions, served by a FastAPI backend that explains every decision, stored in PostgreSQL,
and reviewed through a web dashboard.

![Checking a transaction: the verdict and the evidence ladder showing which features pushed it toward fraud](docs/screenshots/check.png)

## What it does

- **Scores a transaction** and returns the fraud probability, the decision, and the five features
  that drove it (SHAP explanations).
- **Shows why**: the dashboard's *evidence ladder* starts at the base fraud rate and walks through
  each feature's push toward or away from fraud, ending above or below the flagging threshold.
- **Checks whole files**: upload a CSV (the full 284,807-row dataset scores in about 30 seconds),
  compare the decisions with real labels, and download the results.
- **Keeps a log** of recorded transactions with the decision, threshold, and model used at the time.
- **Explains itself**: a built-in Guide page walks through every feature and how to read a verdict.

## Model results

Measured on a held-out test set of 42,559 transactions (71 frauds) that played no part in
training or model selection:

| Metric | XGBoost (served) | Logistic regression (baseline) |
|---|---|---|
| PR-AUC | **0.829** | 0.694 |
| Frauds caught (recall) | 52 of 71 (73%) | 54 of 71 (76%) |
| Flags that were fraud (precision) | **96%** | 83% |
| False alarms | **2** | 11 |

Fraud is 0.17% of transactions, so accuracy is meaningless here (predicting "never fraud" scores
99.8%). The project uses **PR-AUC** (area under the precision-recall curve) as its main metric.
Random forest, SVM, k-NN, and naive Bayes were also compared; none beat XGBoost.

## Architecture

```
Browser ──► nginx (frontend container, :8080)
              ├── /        React app (static files)
              └── /api/*   ──► FastAPI (api container)
                                 ├── ml/predictor.py   model + threshold
                                 ├── ml/src/explain.py SHAP explanations
                                 └── PostgreSQL (db container)
```

| Layer | Stack |
|---|---|
| ML | scikit-learn pipelines, XGBoost, imbalanced-learn, SHAP |
| API | FastAPI, Pydantic, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 17 (SQLite fallback for quick local runs and tests) |
| Frontend | React 19, TypeScript, Vite, Papa Parse |
| Deployment | Docker Compose: `db`, `api`, `frontend` (nginx) |

## Quick start (Docker)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/), Python 3.13, and the dataset.

**1. Get the dataset.** Download `creditcard.csv` from
[Kaggle: Credit Card Fraud Detection](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)
and place it at `ml/data/creditcard.csv`. It isn't committed (144 MB, and licensed separately).

**2. Train the model.** The trained model isn't committed either; training takes about a minute.

```bash
python -m venv .venv
.venv/Scripts/activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m ml.src.train          # writes ml/artifacts/model.joblib + metadata.json
```

**3. Start everything.**

```bash
cp .env.example .env            # defaults work as is; set API_KEY and POSTGRES_PASSWORD for shared machines
docker compose up -d --build
```

Open **http://127.0.0.1:8080**. Interactive API docs are at http://127.0.0.1:8080/api/docs.

## Local development

Run PostgreSQL in Docker and the API and frontend directly, with live reload:

```bash
docker compose up -d db                              # PostgreSQL only
python -m uvicorn app.main:app --reload              # API on http://127.0.0.1:8000 (uses DATABASE_URL from .env)
cd frontend && npm install && npm run dev            # UI on http://127.0.0.1:5173, proxies /api to :8000
```

Without a `DATABASE_URL`, the API falls back to a local SQLite file, so it also runs with no Docker at all.

On Windows, use `127.0.0.1` rather than `localhost`: `localhost` tries IPv6 first and adds about
two seconds to every request.

## Using the API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server and model status |
| `GET` | `/model` | Model name, threshold, feature list, test metrics, batch limit |
| `POST` | `/predictions` | Score one transaction (add `?explain=false` to skip the reasons) |
| `POST` | `/predictions/batch` | Score up to 1,000 transactions |
| `POST` | `/transactions` | Score and store a transaction |
| `GET` | `/transactions` | List stored transactions (`?is_fraud=true`, `limit`, `offset`) |
| `GET` | `/transactions/{id}` | One stored transaction |

A transaction is 29 numbers: `Amount` plus `V1` to `V28`, which the card issuer anonymised with PCA
before releasing the data.

Abbreviated example (a real request must include all 29 fields):

```bash
curl -X POST http://127.0.0.1:8000/predictions \
  -H "Content-Type: application/json" \
  -d '{"Amount": 219.8, "V1": -5.62, "V2": 3.48, ..., "V28": 0.46}'
```

```json
{
  "fraud_probability": 0.988,
  "is_fraud": true,
  "threshold": 0.628,
  "model": "xgboost",
  "base_value": -6.73,
  "top_features": [
    { "feature": "V17", "value": -10.61, "contribution": 4.51 },
    { "feature": "V10", "value": -6.56, "contribution": 1.96 }
  ]
}
```

`contribution` values are SHAP values in log-odds: positive pushes toward fraud, negative away
from it, and `base_value` plus all contributions equals the model's score.

When `API_KEY` is set, `/predictions` and `/transactions` require an `X-API-Key` header.
`/`, `/health`, and `/model` stay open.

## How the model was built

1. **Cleaning**: 1,081 exact duplicate rows removed; no missing values.
2. **Splitting**: stratified 70/15/15 train/validation/test, so each set keeps the 0.17% fraud rate.
3. **Preprocessing**: `RobustScaler` on V1-V28, `log1p` then `RobustScaler` on Amount. These are
   fitted on the training set only and saved inside the model pipeline, so serving uses
   exactly the same transforms. Raw `Time` is dropped: it counts seconds from the dataset's first
   transaction and means nothing for new ones.
4. **Imbalance**: no rebalancing, class weights, and SMOTE were compared; plain XGBoost scored best.
5. **Selection**: the model and the decision threshold (62.8%, the F1-optimal point) were chosen on
   validation data. The test set was used once, for the final numbers above.

```bash
python -m ml.src.train                  # compare all models; saves the winner
python -m ml.src.train --models logreg  # logistic regression only (logreg_*.joblib)
python -m ml.src.explain                # example explanations + feature-importance chart
```

The exploratory analysis is in [`ml/notebooks/01_eda.ipynb`](ml/notebooks/01_eda.ipynb).

## Project structure

```
app/            FastAPI app: routes, schemas, services, settings, API-key auth
db/             SQLAlchemy models, session, Alembic migrations
ml/
  src/          data loading, preprocessing, training, evaluation, SHAP explanations
  predictor.py  loads the trained pipeline and threshold for serving
  notebooks/    exploratory data analysis
  data/         creditcard.csv (not committed)
  artifacts/    trained model + metadata (not committed)
frontend/       React + TypeScript dashboard, nginx config
tests/          API tests
```

## Tests

```bash
python -m pytest tests                     # against a temporary SQLite database
TEST_DATABASE_URL=postgresql+psycopg2://fraudguard:fraudguard@127.0.0.1:5432/fraudguard_test \
  python -m pytest tests                   # against PostgreSQL (create fraudguard_test first)
cd frontend && npm run build               # type-check and build the frontend
```

The tests need the trained model and the dataset, and skip themselves if either is missing.

**End-to-end tests** drive the real app in Chrome with [Playwright](https://playwright.dev): every view,
error messages, CSV edge cases, cancelling a batch, the API key flow, phone layout, and an automated
accessibility scan. They need Google Chrome installed (no browser download).

```bash
cd frontend
npm run e2e          # starts its own API + UI on a fresh throwaway database (60 tests)
npm run e2e:docker   # read-only checks against the running Docker stack on :8080
```

## Database migrations

The schema is managed by Alembic, and the API applies pending migrations when it starts. After
changing `db/models.py`:

```bash
python -m alembic revision --autogenerate -m "describe the change"
```

Review the generated file in `db/migrations/versions/` before committing it.

## Limitations

- **Anonymised features**: V1-V28 are PCA components, so explanations read "V17 was unusually low"
  rather than in business terms.
- **Two days of data from 2013**: fraud patterns drift, and a real system would retrain regularly
  and validate on later time periods (`ml/src/data.py` has a time-based split for this).
- **Single-user security model**: the optional API key is stored in the browser. A shared
  deployment would need proper user authentication.

## Data

[Credit Card Fraud Detection](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud) by the
Machine Learning Group of ULB (Université Libre de Bruxelles) and Worldline: transactions made by
European cardholders over two days in September 2013.
