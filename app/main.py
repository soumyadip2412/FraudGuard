import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import health, predictions, transactions
from app.core.config import get_settings
from app.core.security import verify_api_key
from app.services.prediction_service import get_explainer
from db.session import init_db

logger = logging.getLogger("fraudguard")


@asynccontextmanager
async def lifespan(_app):
    init_db()
    try:
        get_explainer()  # load the model now so the first request isn't slow
    except FileNotFoundError:
        logger.warning("No trained model found; prediction endpoints will return 503")
    except ValueError as exc:
        logger.warning("Explanations unavailable (%s); use ?explain=false", exc)
    yield


app = FastAPI(title=get_settings().app_name, version="0.1.0", lifespan=lifespan)

# Health stays open so load balancers / Docker can probe it without a key.
app.include_router(health.router)
app.include_router(predictions.router, dependencies=[Depends(verify_api_key)])
app.include_router(transactions.router, dependencies=[Depends(verify_api_key)])


@app.exception_handler(FileNotFoundError)
async def model_missing(_request: Request, _exc: FileNotFoundError):
    return JSONResponse(status_code=503, content={"detail": "Model not available; train it first"})
