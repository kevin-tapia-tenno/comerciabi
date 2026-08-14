from __future__ import annotations

import argparse
import getpass
import json
import sys
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

import httpx

from api.app.config import get_settings


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def print_check(check: Check) -> None:
    marker = "OK" if check.ok else "ERROR"
    print(f"[{marker}] {check.name}: {check.detail}")


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    expected_status: int = 200,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = client.request(
        method,
        url,
        headers=headers,
        json=json_body,
    )

    if response.status_code != expected_status:
        body = response.text[:1200]
        raise RuntimeError(
            f"{method} {url} devolvió HTTP {response.status_code}; "
            f"se esperaba {expected_status}. Respuesta: {body}"
        )

    if not response.content:
        return {}

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(
            f"{method} {url} no devolvió JSON válido. "
            f"Respuesta: {response.text[:1200]}"
        ) from exc

    if not isinstance(data, dict):
        raise RuntimeError(
            f"{method} {url} devolvió un JSON inesperado: "
            f"{type(data).__name__}"
        )

    return data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke test autenticado end-to-end de ComercioBI API "
            "(Supabase Auth -> FastAPI -> tenant -> serving layer IA)."
        )
    )
    parser.add_argument(
        "--email",
        help="Correo de un usuario existente de Supabase Auth.",
    )
    parser.add_argument(
        "--api-base-url",
        default="http://127.0.0.1:8000",
        help="Base URL de la API local o desplegada.",
    )
    parser.add_argument(
        "--empresa-id",
        help=(
            "UUID opcional de una empresa concreta. "
            "Si se omite, se validan todas las membresías utilizables."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    settings = get_settings()

    api_base_url = args.api_base_url.rstrip("/")
    supabase_url = settings.supabase_url.rstrip("/")
    api_key = settings.auth_api_key

    if not api_key:
        print(
            "ERROR: api/.env debe contener SUPABASE_PUBLISHABLE_KEY "
            "o SUPABASE_ANON_KEY."
        )
        return 2

    email = (args.email or input("Correo Supabase Auth: ")).strip()
    if not email:
        print("ERROR: el correo no puede estar vacío.")
        return 2

    password = getpass.getpass("Contraseña Supabase Auth: ")
    if not password:
        print("ERROR: la contraseña no puede estar vacía.")
        return 2

    if args.empresa_id:
        try:
            requested_empresa_id = UUID(args.empresa_id)
        except ValueError:
            print("ERROR: --empresa-id debe ser un UUID válido.")
            return 2
    else:
        requested_empresa_id = None

    print()
    print("=== ComercioBI - Fase 14.14C / Auth E2E ===")
    print(f"API: {api_base_url}")
    print(f"Supabase: {supabase_url}")
    print("Credenciales: no se imprimirán ni se guardarán.")
    print()

    checks: list[Check] = []

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        # 1) API pública
        health = request_json(
            client,
            "GET",
            f"{api_base_url}/api/v1/health",
        )
        checks.append(
            Check(
                "Health API",
                health.get("status") == "ok",
                json.dumps(health, ensure_ascii=False),
            )
        )

        health_db = request_json(
            client,
            "GET",
            f"{api_base_url}/api/v1/health/db",
        )
        checks.append(
            Check(
                "Health DB",
                health_db.get("status") == "ok",
                json.dumps(health_db, ensure_ascii=False),
            )
        )

        # 2) Control negativo: auth requerida
        unauthorized = client.get(f"{api_base_url}/api/v1/auth/me")
        checks.append(
            Check(
                "Auth sin token",
                unauthorized.status_code == 401,
                f"HTTP {unauthorized.status_code} (esperado 401)",
            )
        )

        # 3) Login real contra Supabase Auth
        login_response = client.post(
            f"{supabase_url}/auth/v1/token",
            params={"grant_type": "password"},
            headers={
                "apikey": api_key,
                "Content-Type": "application/json",
            },
            json={
                "email": email,
                "password": password,
            },
        )

        if login_response.status_code != 200:
            raise RuntimeError(
                "Login Supabase falló con HTTP "
                f"{login_response.status_code}: "
                f"{login_response.text[:1200]}"
            )

        login_data = login_response.json()
        access_token = login_data.get("access_token")
        if not access_token:
            raise RuntimeError(
                "Supabase respondió 200 pero no devolvió access_token."
            )

        checks.append(
            Check(
                "Login Supabase",
                True,
                "access_token recibido correctamente",
            )
        )

        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }

        # 4) Identidad + membresías reales
        me = request_json(
            client,
            "GET",
            f"{api_base_url}/api/v1/auth/me",
            headers=auth_headers,
        )

        memberships = me.get("memberships") or []
        checks.append(
            Check(
                "GET /auth/me",
                str(me.get("email", "")).lower() == email.lower(),
                f"usuario={me.get('email')} | membresías={len(memberships)}",
            )
        )

        usable: list[dict[str, Any]] = []
        for membership in memberships:
            if (
                membership.get("empresa_activa") is True
                and membership.get("membresia_activa") is True
                and membership.get("empresa_key") is not None
            ):
                usable.append(membership)

        if requested_empresa_id is not None:
            usable = [
                item
                for item in usable
                if str(item.get("empresa_id")) == str(requested_empresa_id)
            ]
            if not usable:
                raise RuntimeError(
                    "La empresa indicada en --empresa-id no aparece como "
                    "membresía activa y sincronizada del usuario."
                )

        if not usable:
            raise RuntimeError(
                "El usuario autenticado no tiene membresías activas "
                "sincronizadas con analytics.dim_empresa."
            )

        # 5) Control negativo de aislamiento multiempresa
        fake_empresa_id = uuid4()
        forbidden_headers = {
            **auth_headers,
            "X-Empresa-Id": str(fake_empresa_id),
        }
        forbidden = client.get(
            f"{api_base_url}/api/v1/ai/summary",
            headers=forbidden_headers,
        )
        checks.append(
            Check(
                "Aislamiento tenant",
                forbidden.status_code == 403,
                f"empresa ajena -> HTTP {forbidden.status_code} (esperado 403)",
            )
        )

        # 6) Endpoints IA para cada empresa utilizable
        endpoints = [
            ("summary", "/api/v1/ai/summary"),
            ("insights", "/api/v1/ai/insights?limit=20"),
            ("sales", "/api/v1/ai/forecasts/sales?limit=50"),
            ("demand", "/api/v1/ai/forecasts/demand?limit=50"),
            (
                "inventory",
                "/api/v1/ai/inventory/recommendations?limit=50",
            ),
            ("dashboard", "/api/v1/ai/dashboard"),
        ]

        for membership in usable:
            empresa_id = str(membership["empresa_id"])
            empresa = str(membership["empresa"])
            empresa_key = membership["empresa_key"]
            tenant_headers = {
                **auth_headers,
                "X-Empresa-Id": empresa_id,
            }

            print()
            print(
                f"--- Tenant: {empresa} | empresa_key={empresa_key} "
                f"| empresa_id={empresa_id} ---"
            )

            for label, path in endpoints:
                payload = request_json(
                    client,
                    "GET",
                    f"{api_base_url}{path}",
                    headers=tenant_headers,
                )

                if label == "summary":
                    detail = (
                        "summary presente"
                        if payload.get("data") is not None
                        else "summary vacío (HTTP 200)"
                    )
                elif label == "dashboard":
                    detail = (
                        "dashboard recibido "
                        f"| insights={len(payload.get('insights') or [])} "
                        f"| sales={len(payload.get('sales_forecast') or [])} "
                        f"| demand={len(payload.get('demand_forecast') or [])} "
                        f"| inventory="
                        f"{len(payload.get('inventory_recommendations') or [])}"
                    )
                else:
                    detail = f"count={payload.get('count', 'N/D')}"

                checks.append(
                    Check(
                        f"{empresa} / {label}",
                        True,
                        detail,
                    )
                )

    print()
    print("=== RESULTADO ===")
    for check in checks:
        print_check(check)

    failed = [check for check in checks if not check.ok]
    if failed:
        print()
        print(f"FALLO: {len(failed)} validación(es) no cumplieron.")
        return 1

    print()
    print(
        "Fase 14.14C validada: Auth, JWT, tenant isolation y endpoints IA "
        "funcionan end-to-end."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelado por el usuario.")
        raise SystemExit(130)
    except Exception as exc:
        print()
        print(f"ERROR: {exc}")
        raise SystemExit(1)
