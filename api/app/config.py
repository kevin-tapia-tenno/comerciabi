from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="api/.env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    supabase_url: str
    supabase_jwt_audience: str = "authenticated"
    supabase_publishable_key: str | None = None
    supabase_anon_key: str | None = None
    supabase_secret_key: str | None = None

    app_public_url: str = "http://localhost:5173"

    api_db_host: str
    api_db_port: int = 6543
    api_db_name: str = "postgres"
    api_db_user: str
    api_db_password: str
    api_db_sslmode: str = "require"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ]
    )

    @field_validator("supabase_url", "app_public_url")
    @classmethod
    def normalize_url(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"

    @property
    def auth_api_key(self) -> str | None:
        return self.supabase_publishable_key or self.supabase_anon_key

    def database_url(self) -> URL:
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.api_db_user,
            password=self.api_db_password,
            host=self.api_db_host,
            port=self.api_db_port,
            database=self.api_db_name,
            query={"sslmode": self.api_db_sslmode},
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
