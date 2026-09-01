from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Connection, text

from api.app.models import Membership


def _rows(result) -> list[dict[str, Any]]:
    return [dict(row) for row in result.mappings().all()]


def _user_context_rows(
    connection: Connection,
    user_id: UUID,
) -> list[dict[str, Any]]:
    result = connection.execute(
        text(
            """
            select *
            from analytics.api_usuario_contexto(:user_id)
            """
        ),
        {"user_id": user_id},
    )
    return _rows(result)


def get_profile(connection: Connection, user_id: UUID) -> dict[str, Any] | None:
    rows = _user_context_rows(connection, user_id)
    if not rows:
        return None

    first = rows[0]
    return {
        "id": first["perfil_id"],
        "nombres": first["nombres"],
        "apellidos": first["apellidos"],
        "activo": first["perfil_activo"],
    }


def get_memberships(
    connection: Connection,
    user_id: UUID,
) -> list[Membership]:
    rows = _user_context_rows(connection, user_id)

    memberships: list[Membership] = []
    for row in rows:
        if row["membership_id"] is None:
            continue
        memberships.append(
            Membership(
                membership_id=row["membership_id"],
                empresa_id=row["empresa_id"],
                empresa_key=row["empresa_key"],
                empresa=row["empresa"],
                rol=row["rol"],
                empresa_activa=row["empresa_activa"],
                membresia_activa=row["membresia_activa"],
            )
        )
    return memberships


def get_summary(connection: Connection, empresa_key: int) -> dict[str, Any] | None:
    row = connection.execute(
        text(
            """
            select *
            from analytics.vw_ai_resumen_actual
            where empresa_key = :empresa_key
            limit 1
            """
        ),
        {"empresa_key": empresa_key},
    ).mappings().first()
    return dict(row) if row else None


def get_insights(
    connection: Connection,
    empresa_key: int,
    *,
    severidad: str | None = None,
    tipo: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    filters = ["empresa_key = :empresa_key"]

    params: dict[str, Any] = {
        "empresa_key": empresa_key,
        "limit": limit,
        "offset": offset,
    }

    if severidad is not None:
        filters.append("severidad = :severidad")
        params["severidad"] = severidad

    if tipo is not None:
        filters.append("tipo = :tipo")
        params["tipo"] = tipo

    query = text(
        f"""
        select *
        from analytics.vw_ai_insights_actual
        where {" and ".join(filters)}
        order by orden, id
        limit :limit offset :offset
        """
    )

    return _rows(
        connection.execute(
            query,
            params,
        )
    )


def get_sales_forecast(
    connection: Connection,
    empresa_key: int,
    *,
    producto_key: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    filters = ["empresa_key = :empresa_key"]

    params: dict[str, Any] = {
        "empresa_key": empresa_key,
        "limit": limit,
        "offset": offset,
    }

    if producto_key is not None:
        filters.append("producto_key = :producto_key")
        params["producto_key"] = producto_key

    query = text(
        f"""
        select *
        from analytics.vw_ai_pronostico_ventas_actual
        where {" and ".join(filters)}
        order by producto, periodo
        limit :limit offset :offset
        """
    )

    return _rows(
        connection.execute(
            query,
            params,
        )
    )


def get_demand_forecast(
    connection: Connection,
    empresa_key: int,
    *,
    producto_key: int | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[dict[str, Any]]:
    filters = ["empresa_key = :empresa_key"]

    params: dict[str, Any] = {
        "empresa_key": empresa_key,
        "limit": limit,
        "offset": offset,
    }

    if producto_key is not None:
        filters.append("producto_key = :producto_key")
        params["producto_key"] = producto_key

    query = text(
        f"""
        select *
        from analytics.vw_ai_pronostico_demanda_actual
        where {" and ".join(filters)}
        order by producto, fecha_inicio
        limit :limit offset :offset
        """
    )

    return _rows(
        connection.execute(
            query,
            params,
        )
    )


def get_inventory_recommendations(
    connection: Connection,
    empresa_key: int,
    *,
    riesgo: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    filters = ["empresa_key = :empresa_key"]

    params: dict[str, Any] = {
        "empresa_key": empresa_key,
        "limit": limit,
        "offset": offset,
    }

    if riesgo is not None:
        filters.append("riesgo = :riesgo")
        params["riesgo"] = riesgo

    query = text(
        f"""
        select *
        from analytics.vw_ai_recomendacion_inventario_actual
        where {" and ".join(filters)}
        order by
            case riesgo
                when 'CRITICO' then 4
                when 'ALTO' then 3
                when 'MEDIO' then 2
                when 'BAJO' then 1
                else 0
            end desc,
            cantidad_sugerida desc,
            producto
        limit :limit offset :offset
        """
    )

    return _rows(
        connection.execute(
            query,
            params,
        )
    )


# ============================================================
# IA - Dashboard consolidado en un solo round-trip
# ============================================================


def get_ai_dashboard_bundle(
    connection: Connection,
    empresa_key: int,
) -> dict[str, Any]:
    row = connection.execute(
        text(
            """
            select jsonb_build_object(

                'summary',
                (
                    select to_jsonb(summary_row)
                    from (
                        select *
                        from analytics.vw_ai_resumen_actual
                        where empresa_key = :empresa_key
                        limit 1
                    ) as summary_row
                ),

                'insights',
                coalesce(
                    (
                        select jsonb_agg(
                            to_jsonb(insight_row)
                        )
                        from (
                            select *
                            from analytics.vw_ai_insights_actual
                            where empresa_key = :empresa_key
                            order by orden, id
                            limit 100
                        ) as insight_row
                    ),
                    '[]'::jsonb
                ),

                'sales_forecast',
                coalesce(
                    (
                        select jsonb_agg(
                            to_jsonb(sales_row)
                        )
                        from (
                            select *
                            from analytics.vw_ai_pronostico_ventas_actual
                            where empresa_key = :empresa_key
                            order by producto, periodo
                            limit 200
                        ) as sales_row
                    ),
                    '[]'::jsonb
                ),

                'demand_forecast',
                coalesce(
                    (
                        select jsonb_agg(
                            to_jsonb(demand_row)
                        )
                        from (
                            select *
                            from analytics.vw_ai_pronostico_demanda_actual
                            where empresa_key = :empresa_key
                            order by producto, fecha_inicio
                            limit 500
                        ) as demand_row
                    ),
                    '[]'::jsonb
                ),

                'inventory_recommendations',
                coalesce(
                    (
                        select jsonb_agg(
                            to_jsonb(inventory_row)
                        )
                        from (
                            select *
                            from analytics.vw_ai_recomendacion_inventario_actual
                            where empresa_key = :empresa_key
                            order by
                                case riesgo
                                    when 'CRITICO' then 4
                                    when 'ALTO' then 3
                                    when 'MEDIO' then 2
                                    when 'BAJO' then 1
                                    else 0
                                end desc,
                                cantidad_sugerida desc,
                                producto
                            limit 200
                        ) as inventory_row
                    ),
                    '[]'::jsonb
                )

            ) as dashboard
            """
        ),
        {
            "empresa_key": empresa_key,
        },
    ).mappings().one()


    dashboard = row[
        "dashboard"
    ]


    if not isinstance(
        dashboard,
        dict,
    ):
        raise RuntimeError(
            "PostgreSQL no devolvi? un objeto "
            "v?lido para el dashboard IA."
        )


    return dashboard
