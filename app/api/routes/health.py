from fastapi import APIRouter, Request

from app.schemas.prediction import MAX_BATCH_SIZE, HealthOut, ModelOut
from app.services.prediction_service import current_predictor

router = APIRouter(tags=["health"])


@router.get("/")
def root(request: Request):
    # Landing message for anyone opening the base URL; /health is the real probe.
    # root_path is "/api" behind the Docker nginx proxy and "" when uvicorn runs directly.
    base = request.scope.get("root_path", "")
    return {"message": "FraudGuard API is running", "docs": f"{base}/docs", "health": f"{base}/health"}


@router.get("/health", response_model=HealthOut)
def health():
    try:
        predictor = current_predictor()
    except FileNotFoundError:
        return HealthOut(status="degraded", model_loaded=False)
    return HealthOut(status="ok", model_loaded=True, model=predictor.model_name, threshold=predictor.threshold)


@router.get("/model", response_model=ModelOut)
def model_info():
    # Training metadata (feature list, test metrics) plus the batch limit, so clients
    # read both from the server instead of hard-coding them.
    # A missing model raises FileNotFoundError, which main.py turns into a 503.
    return {**current_predictor().metadata, "max_batch_size": MAX_BATCH_SIZE}
