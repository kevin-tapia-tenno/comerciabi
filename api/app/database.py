from __future__ import annotations

from functools import lru_cache
from typing import Generator

from sqlalchemy import Connection, Engine, create_engine
from sqlalchemy.pool import QueuePool

from api.app.config import get_settings


@lru_cache
def get_engine() -> Engine:
    settings = get_settings()

    return create_engine(
        settings.database_url(),

        # Pool pequeño para reutilizar la conexión cliente
        # hacia Supavisor entre requests calientes.
        poolclass=QueuePool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=10,

        # Evita conservar conexiones demasiado antiguas.
        pool_recycle=300,

        # Verifica la conexión antes de reutilizarla.
        pool_pre_ping=False,

        # Preferimos reutilizar la conexión más reciente.
        pool_use_lifo=True,

        # La API de serving usa un rol PostgreSQL de solo lectura.
        # AUTOCOMMIT evita crear una transaccion innecesaria
        # para cada consulta SELECT.
        isolation_level="AUTOCOMMIT",

        # Desde SQLAlchemy 2.0.43 evita el ROLLBACK DBAPI
        # al devolver conexiones autocommit al pool.
        skip_autocommit_rollback=True,

        # Obligatorio con Supavisor transaction mode.
        connect_args={
            "prepare_threshold": None,
        },

        future=True,
    )


def get_db() -> Generator[Connection, None, None]:
    engine = get_engine()
    with engine.connect() as connection:
        yield connection
