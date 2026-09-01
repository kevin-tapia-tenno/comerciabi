from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Connection, text

from api.app.admin_models import (
    InviteCompanyUserRequest,
    InviteCompanyUserResponse,
)
from api.app.ai_models import (
    AIDashboardResponse,
    AIDemandForecastResponse,
    AIInsightsResponse,
    AIInventoryRecommendationsResponse,
    AISalesForecastResponse,
    AISummaryResponse,
)
from api.app.config import Settings, get_settings
from api.app.database import get_db
from api.app.models import (
    AuthMeResponse,
    CurrentUser,
    HealthResponse,
    TenantContext,
)
from api.app.repository import (
    get_ai_dashboard_bundle,
    get_demand_forecast,
    get_insights,
    get_inventory_recommendations,
    get_memberships,
    get_profile,
    get_sales_forecast,
    get_summary,
)
from api.app.security import get_current_user
from api.app.supabase_admin import (
    delete_auth_user,
    ensure_company_membership,
    find_auth_user_by_email,
    invite_auth_user,
)
from api.app.tenancy import get_tenant_context


router = APIRouter()


# ============================================================
# Health
# ============================================================


@router.get(
    "/api/v1/health",
    response_model=HealthResponse,
    tags=["Health"],
)
def health(
    settings: Settings = Depends(get_settings),
) -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="comerciabi-api",
        environment=settings.app_env,
    )


@router.get(
    "/api/v1/health/db",
    tags=["Health"],
)
def health_db(
    connection: Connection = Depends(get_db),
) -> dict:
    connection.execute(text("select 1"))

    return {
        "status": "ok",
        "database": "reachable",
    }


# ============================================================
# Auth
# ============================================================


@router.get(
    "/api/v1/auth/me",
    response_model=AuthMeResponse,
    tags=["Auth"],
)
def auth_me(
    current_user: CurrentUser = Depends(get_current_user),
    connection: Connection = Depends(get_db),
) -> AuthMeResponse:
    profile = get_profile(
        connection,
        current_user.user_id,
    )

    memberships = get_memberships(
        connection,
        current_user.user_id,
    )

    return AuthMeResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        nombres=profile.get("nombres") if profile else None,
        apellidos=profile.get("apellidos") if profile else None,
        memberships=memberships,
    )


# ============================================================
# Administración - Usuarios y roles
# ============================================================


@router.post(
    "/api/v1/admin/users/invite",
    response_model=InviteCompanyUserResponse,
    tags=["Admin"],
)
def invite_company_user(
    payload: InviteCompanyUserRequest,
    current_user: CurrentUser = Depends(get_current_user),
    tenant: TenantContext = Depends(get_tenant_context),
    settings: Settings = Depends(get_settings),
) -> InviteCompanyUserResponse:
    if tenant.rol != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador puede gestionar usuarios de la empresa.",
        )

    existing = find_auth_user_by_email(
        settings,
        payload.email,
    )

    created_by_request = False

    if existing is None:
        auth_user = invite_auth_user(
            settings,
            email=payload.email,
            nombres=payload.nombres,
            apellidos=payload.apellidos,
        )
        created_by_request = True
        action = "INVITED"
        message = (
            "Invitación enviada y usuario asignado a la empresa correctamente."
        )
    elif existing.confirmed:
        auth_user = existing
        action = "LINKED_EXISTING"
        message = (
            "La cuenta ya existía en ComercioBI y fue vinculada a la empresa."
        )
    else:
        auth_user = invite_auth_user(
            settings,
            email=payload.email,
            nombres=payload.nombres,
            apellidos=payload.apellidos,
        )
        action = "RESENT_INVITE"
        message = (
            "La cuenta estaba pendiente; se reenvió la invitación y se actualizó su membresía."
        )

    try:
        membership_id = ensure_company_membership(
            settings,
            access_token=current_user.access_token,
            empresa_id=tenant.empresa_id,
            perfil_id=auth_user.user_id,
            rol=payload.rol,
        )
    except Exception:
        if created_by_request:
            delete_auth_user(
                settings,
                auth_user.user_id,
            )
        raise

    return InviteCompanyUserResponse(
        user_id=auth_user.user_id,
        membership_id=membership_id,
        email=auth_user.email,
        rol=payload.rol,
        action=action,
        message=message,
    )


# ============================================================
# IA - Resumen ejecutivo
# ============================================================


@router.get(
    "/api/v1/ai/summary",
    response_model=AISummaryResponse,
    tags=["AI"],
)
def ai_summary(
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AISummaryResponse:
    summary = get_summary(
        connection,
        tenant.empresa_key,
    )

    return AISummaryResponse(
        tenant=tenant,
        data=summary,
    )


# ============================================================
# IA - Business Insights
# ============================================================


@router.get(
    "/api/v1/ai/insights",
    response_model=AIInsightsResponse,
    tags=["AI"],
)
def ai_insights(
    severidad: (
        Literal[
            "INFO",
            "BAJA",
            "MEDIA",
            "ALTA",
            "CRITICA",
        ]
        | None
    ) = None,
    tipo: (
        Literal[
            "VENTAS",
            "DEMANDA",
            "INVENTARIO",
            "MODELO",
            "OPERACION",
        ]
        | None
    ) = None,
    limit: Annotated[
        int,
        Query(ge=1, le=200),
    ] = 100,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AIInsightsResponse:
    rows = get_insights(
        connection,
        tenant.empresa_key,
        severidad=severidad,
        tipo=tipo,
        limit=limit,
        offset=offset,
    )

    return AIInsightsResponse(
        tenant=tenant,
        count=len(rows),
        data=rows,
    )


# ============================================================
# IA - Pronóstico de ventas
# ============================================================


@router.get(
    "/api/v1/ai/forecasts/sales",
    response_model=AISalesForecastResponse,
    tags=["AI"],
)
def ai_sales_forecast(
    producto_key: int | None = Query(
        default=None,
        ge=1,
    ),
    limit: Annotated[
        int,
        Query(ge=1, le=200),
    ] = 100,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AISalesForecastResponse:
    rows = get_sales_forecast(
        connection,
        tenant.empresa_key,
        producto_key=producto_key,
        limit=limit,
        offset=offset,
    )

    return AISalesForecastResponse(
        tenant=tenant,
        count=len(rows),
        data=rows,
    )


# ============================================================
# IA - Pronóstico de demanda
# ============================================================


@router.get(
    "/api/v1/ai/forecasts/demand",
    response_model=AIDemandForecastResponse,
    tags=["AI"],
)
def ai_demand_forecast(
    producto_key: int | None = Query(
        default=None,
        ge=1,
    ),
    limit: Annotated[
        int,
        Query(ge=1, le=500),
    ] = 200,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AIDemandForecastResponse:
    rows = get_demand_forecast(
        connection,
        tenant.empresa_key,
        producto_key=producto_key,
        limit=limit,
        offset=offset,
    )

    return AIDemandForecastResponse(
        tenant=tenant,
        count=len(rows),
        data=rows,
    )


# ============================================================
# IA - Recomendaciones de inventario
# ============================================================


@router.get(
    "/api/v1/ai/inventory/recommendations",
    response_model=AIInventoryRecommendationsResponse,
    tags=["AI"],
)
def ai_inventory_recommendations(
    riesgo: (
        Literal[
            "BAJO",
            "MEDIO",
            "ALTO",
            "CRITICO",
        ]
        | None
    ) = None,
    limit: Annotated[
        int,
        Query(ge=1, le=200),
    ] = 100,
    offset: Annotated[
        int,
        Query(ge=0),
    ] = 0,
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AIInventoryRecommendationsResponse:
    rows = get_inventory_recommendations(
        connection,
        tenant.empresa_key,
        riesgo=riesgo,
        limit=limit,
        offset=offset,
    )

    return AIInventoryRecommendationsResponse(
        tenant=tenant,
        count=len(rows),
        data=rows,
    )


# ============================================================
# IA - Dashboard consolidado
# ============================================================


@router.get(
    "/api/v1/ai/dashboard",
    response_model=AIDashboardResponse,
    tags=["AI"],
)
def ai_dashboard(
    tenant: TenantContext = Depends(get_tenant_context),
    connection: Connection = Depends(get_db),
) -> AIDashboardResponse:
    dashboard = get_ai_dashboard_bundle(
        connection,
        tenant.empresa_key,
    )

    return AIDashboardResponse(
        tenant=tenant,
        summary=dashboard.get(
            "summary"
        ),
        insights=dashboard.get(
            "insights",
            [],
        ),
        sales_forecast=dashboard.get(
            "sales_forecast",
            [],
        ),
        demand_forecast=dashboard.get(
            "demand_forecast",
            [],
        ),
        inventory_recommendations=dashboard.get(
            "inventory_recommendations",
            [],
        ),
    )
