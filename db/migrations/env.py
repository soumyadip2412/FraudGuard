from alembic import context

from db import models  # noqa: F401  (importing registers the tables on Base)
from db.session import Base, engine

# Logging is deliberately not configured here: Alembic's usual fileConfig() call would
# disable uvicorn's loggers when migrations run at API startup.


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            # SQLite can't ALTER most columns; batch mode recreates the table instead.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
