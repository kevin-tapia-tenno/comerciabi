from __future__ import annotations

import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


UserRoleLiteral = Literal[
    "ADMIN",
    "GERENTE",
    "VENDEDOR",
    "ALMACEN",
    "ANALISTA",
]


class InviteCompanyUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    nombres: str = Field(min_length=1, max_length=100)
    apellidos: str = Field(min_length=1, max_length=100)
    rol: UserRoleLiteral

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", normalized):
            raise ValueError("Ingresa un correo electrónico válido.")
        return normalized

    @field_validator("nombres", "apellidos")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not normalized:
            raise ValueError("El nombre y los apellidos son obligatorios.")
        return normalized


class InviteCompanyUserResponse(BaseModel):
    user_id: UUID
    membership_id: UUID
    email: str
    rol: UserRoleLiteral
    action: Literal[
        "INVITED",
        "RESENT_INVITE",
        "LINKED_EXISTING",
    ]
    message: str
