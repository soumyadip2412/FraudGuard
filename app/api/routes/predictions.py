from fastapi import APIRouter

from app.schemas.prediction import BatchIn, PredictionOut, TransactionIn
from app.services.prediction_service import score

# Stateless scoring: nothing is stored. Use /transactions to score and record.
router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.post("", response_model=PredictionOut)
def predict(transaction: TransactionIn, explain: bool = True):
    return score([transaction.model_dump()], explain)[0]


@router.post("/batch", response_model=list[PredictionOut])
def predict_batch(batch: BatchIn, explain: bool = False):
    return score([t.model_dump() for t in batch.transactions], explain)
