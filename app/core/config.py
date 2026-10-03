from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from environment variables (or .env); names are case-insensitive."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "FraudGuard"
    # Empty disables auth (local development). Set it for any shared deployment.
    api_key: str = ""
    # SQLite for local work; docker-compose points this at PostgreSQL.
    database_url: str = "sqlite:///./fraudguard.db"
    # "" serves the full-run winner (model.joblib). Explanations need a tree model;
    # a linear one (e.g. "logreg_") only works with ?explain=false.
    artifact_prefix: str = ""
    explain_top_k: int = 5


@lru_cache
def get_settings():
    return Settings()
