from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL


ETL_DIR = Path(__file__).resolve().parents[1]
ENV_PATH = ETL_DIR / ".env"
OUTPUT_DIR = ETL_DIR / "output"


class ConfigError(RuntimeError):
    """Error de configuración del ETL."""


@dataclass(frozen=True)
class DatabaseConfig:
    host: str
    port: int
    database: str
    user: str
    password: str
    sslmode: str

    def sqlalchemy_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.user,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.database,
            query={"sslmode": self.sslmode},
        )


def _required_env(name: str) -> str:
    import os

    value = os.getenv(name, "").strip()
    if not value:
        raise ConfigError(
            f"Falta la variable {name} en etl/.env. "
            "Revisa etl/.env.example y completa los datos de Supabase."
        )
    return value


def load_database_config() -> DatabaseConfig:
    if not ENV_PATH.exists():
        raise ConfigError(
            "No existe etl/.env. Copia etl/.env.example como etl/.env "
            "y completa la conexión PostgreSQL de Supabase."
        )

    load_dotenv(ENV_PATH, override=False)

    port_text = _required_env("DB_PORT")
    try:
        port = int(port_text)
    except ValueError as exc:
        raise ConfigError("DB_PORT debe ser un número entero.") from exc

    return DatabaseConfig(
        host=_required_env("DB_HOST"),
        port=port,
        database=_required_env("DB_NAME"),
        user=_required_env("DB_USER"),
        password=_required_env("DB_PASSWORD"),
        sslmode=_required_env("DB_SSLMODE"),
    )
