from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Connection, text

from api.app.config import Settings, get_settings
from api.app.database import get_db
from api.app.models import AuthMeResponse, CurrentUser, HealthResponse, TenantContext
from api.app.repository import (
    get_demand_forecast,
    get_insights,
    get_inventory_recommendations,
    get_memberships,
    get_profile,
    get_sales_forecast,
    get_summary,
)
from api.app.security import get_current_user
from api.app.tenancy import get_tenant_context


router = APIRouter()


@router.get("/api/v1/health", response_model=HealthResponse, tags=["Health"])
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="comerciabi-api",
        environment=settings.app_env,
    )


@router.get("/api/v1/health/db", tags=["Health"])
def health_db(connection: Connection = Depends(get_db)) -> dict:
    connection.execute(text("select 1"))
    return {"status": "ok", "database": "reachable"}


@router.get("/api/v1/auth/me", response_model=AuthMeResponse, tags=["Auth"])
def auth_me(
    current_user: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_db),
) -> AuthMeResponse:
    profile = get_profile(connection, current_user.user_id)
    memberships = get_memberships(connection, current_user.user_id)

    return AuthMeResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        nombres=profile.get("nombres") if profile else None,
        apellidos=profile.get("apellidos") if profile else None,
        memberships=memberships,
    )


@router.get("/api/v1/ai/summary", tags=["AI"])
def ai_summary(
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    return {
        "tenant": tenant.model_dump(mode="json"),
        "data": get_summary(connection, tenant.empresa_key),
    }


@router.get("/api/v1/ai/insights", tags=["AI"])
def ai_insights(
    severidad: Literal["INFO", "BAJA", "MEDIA", "ALTA", "CRITICA"] | None = None,
    tipo: Literal["VENTAS", "DEMANDA", "INVENTARIO", "MODELO", "OPERACION"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    rows = get_insights(
        connection,
        tenant.empresa_key,
        severidad=severidad,
        tipo=tipo,
        limit=limit,
        offset=offset,
    )
    return {"tenant": tenant.model_dump(mode="json"), "count": len(rows), "data": rows}


@router.get("/api/v1/ai/forecasts/sales", tags=["AI"])
def ai_sales_forecast(
    producto_key: int | None = Query(default=None, ge=1),
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    rows = get_sales_forecast(
        connection,
        tenant.empresa_key,
        producto_key=producto_key,
        limit=limit,
        offset=offset,
    )
    return {"tenant": tenant.model_dump(mode="json"), "count": len(rows), "data": rows}


@router.get("/api/v1/ai/forecasts/demand", tags=["AI"])
def ai_demand_forecast(
    producto_key: int | None = Query(default=None, ge=1),
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    rows = get_demand_forecast(
        connection,
        tenant.empresa_key,
        producto_key=producto_key,
        limit=limit,
        offset=offset,
    )
    return {"tenant": tenant.model_dump(mode="json"), "count": len(rows), "data": rows}


@router.get("/api/v1/ai/inventory/recommendations", tags=["AI"])
def ai_inventory_recommendations(
    riesgo: Literal["BAJO", "MEDIO", "ALTO", "CRITICO"] | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    rows = get_inventory_recommendations(
        connection,
        tenant.empresa_key,
        riesgo=riesgo,
        limit=limit,
        offset=offset,
    )
    return {"tenant": tenant.model_dump(mode="json"), "count": len(rows), "data": rows}


@router.get("/api/v1/ai/dashboard", tags=["AI"])
def ai_dashboard(
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> dict:
    return {
        "tenant": tenant.model_dump(mode="json"),
        "summary": get_summary(connection, tenant.empresa_key),
        "insights": get_insights(connection, tenant.empresa_key, limit=100),
        "sales_forecast": get_sales_forecast(connection, tenant.empresa_key, limit=200),
        "demand_forecast": get_demand_forecast(connection, tenant.empresa_key, limit=500),
        "inventory_recommendations": get_inventory_recommendations(
            connection, tenant.empresa_key, limit=200
        ),
    }
