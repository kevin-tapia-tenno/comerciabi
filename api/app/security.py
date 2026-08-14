from __future__ import annotations

from functools import lru_cache
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

from api.app.config import Settings, get_settings
from api.app.models import CurrentUser


bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=8)
def _jwk_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(
        jwks_url,
        cache_keys=True,
        cache_jwk_set=True,
        lifespan=300,
    )


def _verify_with_jwks(token: str, settings: Settings) -> dict:
    header = jwt.get_unverified_header(token)
    algorithm = str(header.get("alg", ""))

    if algorithm not in {"RS256", "ES256", "EdDSA"}:
        raise InvalidTokenError("Firma asimétrica no admitida.")

    signing_key = _jwk_client(settings.supabase_jwks_url).get_signing_key_from_jwt(
        token
    )

    return jwt.decode(
        token,
        signing_key.key,
        algorithms=[algorithm],
        audience=settings.supabase_jwt_audience,
        issuer=settings.supabase_issuer,
        options={"require": ["exp", "sub"]},
    )


def _verify_with_auth_server(token: str, settings: Settings) -> dict:
    api_key = settings.auth_api_key
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Falta SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY "
                "para validar la sesión."
            ),
        )

    try:
        response = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": api_key,
                "Authorization": f"Bearer {token}",
            },
            timeout=8.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No fue posible validar la sesión con Supabase Auth.",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = response.json()
    return {
        "sub": user["id"],
        "email": user.get("email"),
        "aud": settings.supabase_jwt_audience,
        "verified_by": "supabase_auth_server",
    }


def verify_access_token(token: str, settings: Settings) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    algorithm = str(header.get("alg", ""))

    if algorithm in {"RS256", "ES256", "EdDSA"}:
        try:
            return _verify_with_jwks(token, settings)
        except (InvalidTokenError, PyJWKClientError):
            return _verify_with_auth_server(token, settings)

    if algorithm == "HS256":
        return _verify_with_auth_server(token, settings)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Algoritmo JWT no admitido.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere un Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    claims = verify_access_token(credentials.credentials, settings)

    try:
        user_id = UUID(str(claims["sub"]))
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token no contiene un usuario válido.",
        ) from exc

    return CurrentUser(
        user_id=user_id,
        email=claims.get("email"),
        claims=claims,
    )
