FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLCONFIGDIR=/tmp/matplotlib

WORKDIR /app

# Dependencies first: this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY app app
COPY db db
COPY ml/__init__.py ml/predictor.py ml/
COPY ml/src ml/src
# ml/artifacts is mounted at runtime (see docker-compose.yml), so retraining
# doesn't require rebuilding the image.

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
# root-path: the frontend's nginx serves this API under /api, so /docs must load /api/openapi.json.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--root-path", "/api"]
