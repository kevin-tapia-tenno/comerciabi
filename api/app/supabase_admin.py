from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status

from api.app.config import Settings


@dataclass(frozen=True)
class AuthUserMatch:
    user_id: UUID
    email: str
    confirmed: bool


def _secret_key(settings: Settings) -> str:
    key = settings.supabase_secret_key
    if key:
        return key

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Falta SUPABASE_SECRET_KEY en la API. "
            "Configura una clave secreta de Supabase únicamente en el servidor."
        ),
    )


def _public_api_key(settings: Settings) -> str:
    key = settings.auth_api_key
    if key:
        return key

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "Falta SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY "
            "para operar contra Supabase Data API."
        ),
    )


def _admin_headers(settings: Settings) -> dict[str, str]:
    key = _secret_key(settings)
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _data_headers(
    settings: Settings,
    access_token: str,
    *,
    prefer: str | None = None,
) -> dict[str, str]:
    headers = {
        "apikey": _public_api_key(settings),
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    if prefer:
        headers["Prefer"] = prefer

    return headers


def _safe_error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        for key in (
            "message",
            "msg",
            "error_description",
            "error",
            "details",
        ):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    text = response.text.strip()
    if text:
        return text[:400]

    return f"HTTP {response.status_code}"


def _raise_supabase_unavailable(
    message: str,
    exc: Exception,
) -> None:
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=message,
    ) from exc


def find_auth_user_by_email(
    settings: Settings,
    email: str,
) -> AuthUserMatch | None:
    normalized_email = email.strip().lower()
    page = 1
    per_page = 1000

    try:
        with httpx.Client(timeout=10.0) as client:
            while page <= 20:
                response = client.get(
                    f"{settings.supabase_url}/auth/v1/admin/users",
                    headers=_admin_headers(settings),
                    params={
                        "page": page,
                        "per_page": per_page,
                    },
                )

                if response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=(
                            "Supabase Auth no permitió consultar los usuarios: "
                            f"{_safe_error_detail(response)}"
                        ),
                    )

                payload = response.json()
                users = payload.get("users", []) if isinstance(payload, dict) else []

                for user in users:
                    if not isinstance(user, dict):
                        continue

                    candidate_email = str(user.get("email") or "").strip().lower()
                    if candidate_email != normalized_email:
                        continue

                    raw_id = user.get("id")
                    if not raw_id:
                        continue

                    confirmed = bool(
                        user.get("confirmed_at")
                        or user.get("email_confirmed_at")
                    )

                    return AuthUserMatch(
                        user_id=UUID(str(raw_id)),
                        email=candidate_email,
                        confirmed=confirmed,
                    )

                if len(users) < per_page:
                    break

                page += 1
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        _raise_supabase_unavailable(
            "No fue posible consultar los usuarios de Supabase Auth.",
            exc,
        )

    return None


def invite_auth_user(
    settings: Settings,
    *,
    email: str,
    nombres: str,
    apellidos: str,
) -> AuthUserMatch:
    redirect_to = (
        f"{settings.app_public_url.rstrip('/')}/aceptar-invitacion"
    )

    try:
        response = httpx.post(
            f"{settings.supabase_url}/auth/v1/invite",
            headers=_admin_headers(settings),
            params={"redirect_to": redirect_to},
            json={
                "email": email.strip().lower(),
                "data": {
                    "nombres": nombres.strip(),
                    "apellidos": apellidos.strip(),
                },
            },
            timeout=12.0,
        )
    except httpx.HTTPError as exc:
        _raise_supabase_unavailable(
            "No fue posible enviar la invitación mediante Supabase Auth.",
            exc,
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Supabase Auth rechazó la invitación: "
                f"{_safe_error_detail(response)}"
            ),
        )

    payload = response.json()

    try:
        user_id = UUID(str(payload["id"]))
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase Auth devolvió una respuesta de invitación inválida.",
        ) from exc

    return AuthUserMatch(
        user_id=user_id,
        email=str(payload.get("email") or email).strip().lower(),
        confirmed=bool(
            payload.get("confirmed_at")
            or payload.get("email_confirmed_at")
        ),
    )


def _membership_query_url(
    settings: Settings,
    *,
    empresa_id: UUID,
    perfil_id: UUID,
) -> str:
    return (
        f"{settings.supabase_url}/rest/v1/usuarios_empresa"
        f"?empresa_id=eq.{empresa_id}"
        f"&perfil_id=eq.{perfil_id}"
        "&select=id,empresa_id,perfil_id,rol,activo"
        "&limit=1"
    )


def ensure_company_membership(
    settings: Settings,
    *,
    access_token: str,
    empresa_id: UUID,
    perfil_id: UUID,
    rol: str,
) -> UUID:
    try:
        with httpx.Client(timeout=10.0) as client:
            lookup = client.get(
                _membership_query_url(
                    settings,
                    empresa_id=empresa_id,
                    perfil_id=perfil_id,
                ),
                headers=_data_headers(settings, access_token),
            )

            if lookup.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "No fue posible comprobar la membresía empresarial: "
                        f"{_safe_error_detail(lookup)}"
                    ),
                )

            rows = lookup.json()
            existing = rows[0] if isinstance(rows, list) and rows else None

            if isinstance(existing, dict) and existing.get("id"):
                membership_id = UUID(str(existing["id"]))

                update = client.patch(
                    (
                        f"{settings.supabase_url}/rest/v1/usuarios_empresa"
                        f"?id=eq.{membership_id}"
                        f"&empresa_id=eq.{empresa_id}"
                        "&select=id"
                    ),
                    headers=_data_headers(
                        settings,
                        access_token,
                        prefer="return=representation",
                    ),
                    json={
                        "rol": rol,
                        "activo": True,
                    },
                )

                if update.status_code not in {200, 204}:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=(
                            "No fue posible reactivar la membresía: "
                            f"{_safe_error_detail(update)}"
                        ),
                    )

                return membership_id

            create = client.post(
                (
                    f"{settings.supabase_url}/rest/v1/usuarios_empresa"
                    "?select=id"
                ),
                headers=_data_headers(
                    settings,
                    access_token,
                    prefer="return=representation",
                ),
                json={
                    "empresa_id": str(empresa_id),
                    "perfil_id": str(perfil_id),
                    "rol": rol,
                    "activo": True,
                },
            )

            if create.status_code not in {200, 201}:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "La cuenta fue preparada, pero no pudo asignarse a la empresa: "
                        f"{_safe_error_detail(create)}"
                    ),
                )

            created_rows = create.json()
            if not isinstance(created_rows, list) or not created_rows:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Supabase no devolvió la membresía creada.",
                )

            return UUID(str(created_rows[0]["id"]))
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        _raise_supabase_unavailable(
            "No fue posible completar la asignación empresarial del usuario.",
            exc,
        )


def delete_auth_user(
    settings: Settings,
    user_id: UUID,
) -> None:
    try:
        response = httpx.delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=_admin_headers(settings),
            timeout=10.0,
        )
    except httpx.HTTPError:
        return

    if response.status_code not in {200, 204}:
        return
