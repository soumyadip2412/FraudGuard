from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import DbSession
from app.schemas.prediction import TransactionIn, TransactionList, TransactionOut
from app.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(transaction: TransactionIn, db: DbSession):
    return transaction_service.create_transaction(db, transaction.model_dump())


@router.get("", response_model=TransactionList)
def list_transactions(
    db: DbSession,
    is_fraud: bool | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    total, items = transaction_service.list_transactions(db, is_fraud, limit, offset)
    return {"total": total, "items": items}


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, db: DbSession):
    transaction = transaction_service.get_transaction(db, transaction_id)
    if transaction is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return transaction
