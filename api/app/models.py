from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class Membership(BaseModel):
    membership_id: UUID
    empresa_id: UUID
    empresa_key: int | None = None
    empresa: str
    rol: str
    empresa_activa: bool
    membresia_activa: bool


class CurrentUser(BaseModel):
    user_id: UUID
    email: str | None = None
    claims: dict[str, Any] = Field(default_factory=dict)


class TenantContext(BaseModel):
    user_id: UUID
    empresa_id: UUID
    empresa_key: int
    empresa: str
    rol: str


class AuthMeResponse(BaseModel):
    user_id: UUID
    email: str | None
    nombres: str | None = None
    apellidos: str | None = None
    memberships: list[Membership]


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
