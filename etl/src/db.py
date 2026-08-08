from __future__ import annotations

from sqlalchemy import Engine, create_engine, text

from .config import DatabaseConfig


def create_database_engine(config: DatabaseConfig) -> Engine:
    return create_engine(
        config.sqlalchemy_url(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 20},
    )


def check_database_connection(engine: Engine) -> None:
    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                select
                  current_database() as database_name,
                  current_user as database_user,
                  current_timestamp as checked_at
                """
            )
        ).mappings().one()

    print(
        "Conexión PostgreSQL correcta: "
        f"base={result['database_name']}, usuario={result['database_user']}"
    )


def check_analytics_schema(engine: Engine) -> None:
    with engine.connect() as connection:
        exists = connection.execute(
            text(
                """
                select exists (
                  select 1
                  from information_schema.tables
                  where table_schema = 'analytics'
                    and table_name = 'fact_ventas'
                )
                """
            )
        ).scalar_one()

    if not exists:
        raise RuntimeError(
            "No existe el modelo analítico. Ejecuta primero "
            "database/migrations/017_modelo_analitico.sql en Supabase."
        )
