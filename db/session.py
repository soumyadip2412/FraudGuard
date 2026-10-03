from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url):
    if url.startswith("sqlite"):
        # FastAPI runs sync endpoints in a thread pool; SQLite must allow that.
        return {"connect_args": {"check_same_thread": False}}
    # Detect connections the database server closed while they sat in the pool.
    return {"pool_pre_ping": True}


_url = get_settings().database_url
engine = create_engine(_url, **_engine_kwargs(_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db():
    """Bring the database schema up to date by applying any pending Alembic migrations."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config(str(ALEMBIC_INI)), "head")


def get_db():
    """One session per request, always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
