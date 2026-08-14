from __future__ import annotations

from functools import lru_cache
from typing import Generator

from sqlalchemy import Connection, Engine, create_engine
from sqlalchemy.pool import NullPool

from api.app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()

    return create_engine(
        settings.database_url(),
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
        future=True,
    )


def get_db() -> Generator[Connection, None, None]:
    engine = get_engine()
    with engine.connect() as connection:
        yield connection
