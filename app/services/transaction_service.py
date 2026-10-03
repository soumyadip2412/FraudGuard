from sqlalchemy import func, select

from app.services.prediction_service import score
from db.models import Transaction


def create_transaction(db, features):
    result = score([features])[0]
    transaction = Transaction(features=features, amount=features["Amount"], **result)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def list_transactions(db, is_fraud=None, limit=50, offset=0):
    query = select(Transaction)
    if is_fraud is not None:
        query = query.where(Transaction.is_fraud == is_fraud)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(query.order_by(Transaction.id.desc()).limit(limit).offset(offset)).all()
    return total, items


def get_transaction(db, transaction_id):
    return db.get(Transaction, transaction_id)
