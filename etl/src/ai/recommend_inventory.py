from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


# ============================================================
# Rutas
# ============================================================

AI_DIR = Path(__file__).resolve().parent
SRC_DIR = AI_DIR.parent
ETL_DIR = SRC_DIR.parent

OUTPUT_AI_DIR = ETL_DIR / "output" / "ai"

OUTPUT_CSV = OUTPUT_AI_DIR / "inventory_recommendations.csv"
OUTPUT_METADATA = OUTPUT_AI_DIR / "inventory_recommendations_metadata.json"

if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

from src.config import load_database_config  # noqa: E402


# ============================================================
# Excepciones
# ============================================================


class RecommendationError(RuntimeError):
    """Error al generar recomendaciones de inventario."""


# ============================================================
# Base de datos
# ============================================================


def _create_engine() -> Engine:
    config = load_database_config()

    return create_engine(
        config.sqlalchemy_url(),
        pool_pre_ping=True,
    )


def _get_latest_ai_execution(engine: Engine) -> dict[str, Any]:
    query = text(
        """
        select
            e.id,
            e.empresa_key,
            e.origen_datos,
            e.algoritmo_demanda,
            e.version_modelo,
            e.finalizado_en
        from analytics.ai_ejecuciones e
        where e.estado = 'COMPLETADA'
          and exists (
              select 1
              from analytics.ai_pronostico_demanda d
              where d.ai_ejecucion_id = e.id
          )
        order by e.id desc
        limit 1
        """
    )

    with engine.connect() as conn:
        row = conn.execute(query).mappings().first()

    if row is None:
        raise RecommendationError(
            "No existe ninguna ejecución IA COMPLETADA "
            "con pronósticos de demanda."
        )

    return dict(row)


# ============================================================
# Extracción
# ============================================================


def _load_demand_forecast(
    engine: Engine,
    execution_id: int,
) -> pd.DataFrame:
    query = text(
        """
        select
            d.ai_ejecucion_id,
            d.empresa_key,
            d.producto_key,
            p.sku,
            p.nombre as producto,
            p.categoria,
            min(d.fecha_inicio) as fecha_inicio,
            max(d.fecha_fin) as fecha_fin,
            count(*) as dias_pronosticados,
            sum(d.unidades_pronosticadas) as demanda_30d,
            sum(d.limite_inferior) as demanda_30d_inferior,
            sum(d.limite_superior) as demanda_30d_superior,
            max(d.modelo) as modelo,
            max(d.origen_datos) as origen_datos
        from analytics.ai_pronostico_demanda d
        join analytics.dim_producto p
          on p.producto_key = d.producto_key
        where d.ai_ejecucion_id = :execution_id
        group by
            d.ai_ejecucion_id,
            d.empresa_key,
            d.producto_key,
            p.sku,
            p.nombre,
            p.categoria
        order by d.producto_key
        """
    )

    return pd.read_sql(
        query,
        engine,
        params={"execution_id": execution_id},
    )


def _load_latest_inventory(
    engine: Engine,
    empresa_key: int,
) -> pd.DataFrame:
    query = text(
        """
        with inventario_ordenado as (
            select
                f.fact_inventario_key,
                f.empresa_key,
                f.producto_key,
                f.almacen_key,
                df.fecha as fecha_inventario,
                f.stock_actual,
                f.stock_minimo,
                f.costo_unitario,
                row_number() over (
                    partition by
                        f.empresa_key,
                        f.producto_key,
                        f.almacen_key
                    order by
                        df.fecha desc,
                        f.fact_inventario_key desc
                ) as rn
            from analytics.fact_inventario_snapshot f
            join analytics.dim_fecha df
              on df.fecha_key = f.fecha_key
            where f.empresa_key = :empresa_key
        )
        select
            i.empresa_key,
            i.producto_key,
            i.almacen_key,
            a.nombre as almacen,
            i.fecha_inventario,
            i.stock_actual,
            i.stock_minimo,
            i.costo_unitario
        from inventario_ordenado i
        join analytics.dim_almacen a
          on a.almacen_key = i.almacen_key
        where i.rn = 1
        order by
            i.producto_key,
            i.almacen_key
        """
    )

    return pd.read_sql(
        query,
        engine,
        params={"empresa_key": empresa_key},
    )


# ============================================================
# Motor de decisión
# ============================================================


def _classify_risk(
    stock_actual: float,
    stock_minimo: float,
    demanda_esperada: float,
    demanda_superior: float,
) -> str:
    stock_final_esperado = stock_actual - demanda_esperada
    stock_final_superior = stock_actual - demanda_superior

    if (
        stock_actual <= stock_minimo
        or stock_final_esperado < 0
    ):
        return "CRITICO"

    if stock_final_esperado < stock_minimo:
        return "ALTO"

    if stock_final_superior < stock_minimo:
        return "MEDIO"

    return "BAJO"


def _build_reason(
    riesgo: str,
    stock_actual: float,
    stock_minimo: float,
    demanda_30d: float,
    demanda_superior: float,
    stock_objetivo: float,
    cantidad_sugerida: float,
    cobertura_dias: float | None,
) -> str:
    cobertura_texto = (
        "sin consumo pronosticado"
        if cobertura_dias is None
        else f"{cobertura_dias:.1f} días de cobertura"
    )

    if riesgo == "CRITICO":
        encabezado = (
            "Riesgo crítico de quiebre de stock."
        )
    elif riesgo == "ALTO":
        encabezado = (
            "El inventario proyectado quedaría "
            "por debajo del stock mínimo."
        )
    elif riesgo == "MEDIO":
        encabezado = (
            "El escenario superior de demanda "
            "podría reducir el inventario por debajo "
            "del mínimo."
        )
    else:
        encabezado = (
            "El inventario cubre el escenario superior "
            "de demanda y conserva el stock mínimo."
        )

    if cantidad_sugerida > 0:
        accion = (
            f"Se recomienda reponer "
            f"{cantidad_sugerida:.0f} unidades."
        )
    else:
        accion = (
            "No se requiere reposición inmediata."
        )

    return (
        f"{encabezado} "
        f"Stock actual: {stock_actual:.2f}; "
        f"stock mínimo: {stock_minimo:.2f}; "
        f"demanda esperada 30d: {demanda_30d:.2f}; "
        f"demanda superior 30d: {demanda_superior:.2f}; "
        f"stock objetivo: {stock_objetivo:.2f}; "
        f"{cobertura_texto}. "
        f"{accion}"
    )


def _generate_recommendations(
    inventory: pd.DataFrame,
    demand: pd.DataFrame,
) -> pd.DataFrame:
    if inventory.empty:
        raise RecommendationError(
            "No se encontró inventario para la empresa."
        )

    if demand.empty:
        raise RecommendationError(
            "No se encontraron pronósticos de demanda."
        )

    merged = inventory.merge(
        demand,
        on=[
            "empresa_key",
            "producto_key",
        ],
        how="left",
        validate="many_to_one",
    )

    missing = merged["demanda_30d"].isna()

    if missing.any():
        products = (
            merged.loc[
                missing,
                "producto_key",
            ]
            .astype(int)
            .unique()
            .tolist()
        )

        raise RecommendationError(
            "Existen productos con inventario pero sin "
            "pronóstico de demanda. producto_key: "
            + ", ".join(map(str, products))
        )

    records: list[dict[str, Any]] = []

    for row in merged.to_dict(orient="records"):
        stock_actual = max(
            0.0,
            float(row["stock_actual"]),
        )

        stock_minimo = max(
            0.0,
            float(row["stock_minimo"]),
        )

        demanda_30d = max(
            0.0,
            float(row["demanda_30d"]),
        )

        demanda_inferior = max(
            0.0,
            float(row["demanda_30d_inferior"]),
        )

        demanda_superior = max(
            demanda_30d,
            float(row["demanda_30d_superior"]),
        )

        demanda_diaria = demanda_30d / 30.0

        if demanda_diaria > 0:
            cobertura_dias = (
                stock_actual / demanda_diaria
            )
        else:
            cobertura_dias = None

        # El objetivo conserva el stock mínimo incluso
        # bajo el escenario superior de demanda.
        stock_objetivo = math.ceil(
            demanda_superior + stock_minimo
        )

        cantidad_sugerida = max(
            0,
            math.ceil(
                stock_objetivo - stock_actual
            ),
        )

        riesgo = _classify_risk(
            stock_actual=stock_actual,
            stock_minimo=stock_minimo,
            demanda_esperada=demanda_30d,
            demanda_superior=demanda_superior,
        )

        motivo = _build_reason(
            riesgo=riesgo,
            stock_actual=stock_actual,
            stock_minimo=stock_minimo,
            demanda_30d=demanda_30d,
            demanda_superior=demanda_superior,
            stock_objetivo=stock_objetivo,
            cantidad_sugerida=cantidad_sugerida,
            cobertura_dias=cobertura_dias,
        )

        records.append(
            {
                "ai_ejecucion_id": int(
                    row["ai_ejecucion_id"]
                ),
                "empresa_key": int(
                    row["empresa_key"]
                ),
                "producto_key": int(
                    row["producto_key"]
                ),
                "sku": row["sku"],
                "producto": row["producto"],
                "categoria": row["categoria"],
                "almacen_key": int(
                    row["almacen_key"]
                ),
                "almacen": row["almacen"],
                "fecha_referencia": pd.to_datetime(
                    row["fecha_inventario"]
                ).date(),
                "stock_actual": round(
                    stock_actual,
                    4,
                ),
                "stock_minimo": round(
                    stock_minimo,
                    4,
                ),
                "demanda_30d": round(
                    demanda_30d,
                    4,
                ),
                "demanda_30d_inferior": round(
                    demanda_inferior,
                    4,
                ),
                "demanda_30d_superior": round(
                    demanda_superior,
                    4,
                ),
                "stock_objetivo": float(
                    stock_objetivo
                ),
                "cantidad_sugerida": float(
                    cantidad_sugerida
                ),
                "cobertura_dias": (
                    None
                    if cobertura_dias is None
                    else round(
                        cobertura_dias,
                        4,
                    )
                ),
                "riesgo": riesgo,
                "motivo": motivo,
                "modelo_demanda": row["modelo"],
                "origen_datos": row[
                    "origen_datos"
                ],
            }
        )

    return pd.DataFrame(records)


# ============================================================
# Persistencia
# ============================================================


def _persist_recommendations(
    engine: Engine,
    recommendations: pd.DataFrame,
    execution_id: int,
) -> None:
    sql = text(
        """
        insert into analytics.ai_recomendacion_inventario (
            ai_ejecucion_id,
            empresa_key,
            producto_key,
            almacen_key,
            fecha_referencia,
            stock_actual,
            stock_minimo,
            demanda_30d,
            stock_objetivo,
            cantidad_sugerida,
            cobertura_dias,
            riesgo,
            motivo
        )
        values (
            :ai_ejecucion_id,
            :empresa_key,
            :producto_key,
            :almacen_key,
            :fecha_referencia,
            :stock_actual,
            :stock_minimo,
            :demanda_30d,
            :stock_objetivo,
            :cantidad_sugerida,
            :cobertura_dias,
            :riesgo,
            :motivo
        )
        on conflict (
            ai_ejecucion_id,
            empresa_key,
            producto_key,
            almacen_key
        )
        do update set
            fecha_referencia =
                excluded.fecha_referencia,
            stock_actual =
                excluded.stock_actual,
            stock_minimo =
                excluded.stock_minimo,
            demanda_30d =
                excluded.demanda_30d,
            stock_objetivo =
                excluded.stock_objetivo,
            cantidad_sugerida =
                excluded.cantidad_sugerida,
            cobertura_dias =
                excluded.cobertura_dias,
            riesgo =
                excluded.riesgo,
            motivo =
                excluded.motivo,
            generado_en =
                now()
        """
    )

    records = []

    for row in recommendations.to_dict(
        orient="records"
    ):
        records.append(
            {
                "ai_ejecucion_id": int(
                    row["ai_ejecucion_id"]
                ),
                "empresa_key": int(
                    row["empresa_key"]
                ),
                "producto_key": int(
                    row["producto_key"]
                ),
                "almacen_key": int(
                    row["almacen_key"]
                ),
                "fecha_referencia": (
                    row["fecha_referencia"]
                ),
                "stock_actual": float(
                    row["stock_actual"]
                ),
                "stock_minimo": float(
                    row["stock_minimo"]
                ),
                "demanda_30d": float(
                    row["demanda_30d"]
                ),
                "stock_objetivo": float(
                    row["stock_objetivo"]
                ),
                "cantidad_sugerida": float(
                    row["cantidad_sugerida"]
                ),
                "cobertura_dias": (
                    None
                    if pd.isna(
                        row["cobertura_dias"]
                    )
                    else float(
                        row["cobertura_dias"]
                    )
                ),
                "riesgo": str(
                    row["riesgo"]
                ),
                "motivo": str(
                    row["motivo"]
                ),
            }
        )

    with engine.begin() as conn:
        conn.execute(sql, records)

        recommendation_summary = {
            "generated": True,
            "generated_at_utc": datetime.now(
                timezone.utc
            ).isoformat(),
            "rows": len(recommendations),
            "risk_counts": {
                str(k): int(v)
                for k, v in (
                    recommendations["riesgo"]
                    .value_counts()
                    .to_dict()
                    .items()
                )
            },
            "total_units_suggested": float(
                recommendations[
                    "cantidad_sugerida"
                ].sum()
            ),
            "policy": {
                "horizon_days": 30,
                "stock_target": (
                    "upper_forecast_30d "
                    "+ minimum_stock"
                ),
                "risk_aware": True,
            },
        }

        conn.execute(
            text(
                """
                update analytics.ai_ejecuciones
                set
                    metadata = jsonb_set(
                        metadata,
                        '{inventory_recommendations}',
                        cast(:recommendation_metadata as jsonb),
                        true
                    ),
                    mensaje = :mensaje
                where id = :execution_id
                """
            ),
            {
                "execution_id": execution_id,
                "recommendation_metadata": json.dumps(
                    recommendation_summary,
                    ensure_ascii=False,
                ),
                "mensaje": (
                    "Pronósticos y recomendaciones "
                    "de inventario persistidos correctamente."
                ),
            },
        )


# ============================================================
# Artefactos
# ============================================================


def _save_artifacts(
    recommendations: pd.DataFrame,
    execution: dict[str, Any],
) -> None:
    OUTPUT_AI_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    recommendations.to_csv(
        OUTPUT_CSV,
        index=False,
        encoding="utf-8",
    )

    metadata = {
        "phase": "14",
        "block": "14.12",
        "execution_id": int(
            execution["id"]
        ),
        "empresa_key": int(
            execution["empresa_key"]
        ),
        "origin": execution[
            "origen_datos"
        ],
        "demand_model": execution[
            "algoritmo_demanda"
        ],
        "model_version": execution[
            "version_modelo"
        ],
        "generated_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),
        "rows": int(
            len(recommendations)
        ),
        "products": int(
            recommendations[
                "producto_key"
            ].nunique()
        ),
        "warehouses": int(
            recommendations[
                "almacen_key"
            ].nunique()
        ),
        "risk_counts": {
            str(k): int(v)
            for k, v in (
                recommendations["riesgo"]
                .value_counts()
                .to_dict()
                .items()
            )
        },
        "total_units_suggested": float(
            recommendations[
                "cantidad_sugerida"
            ].sum()
        ),
        "policy": {
            "forecast_horizon_days": 30,
            "stock_target": (
                "demanda_30d_superior "
                "+ stock_minimo"
            ),
            "quantity_suggested": (
                "max(0, stock_objetivo "
                "- stock_actual)"
            ),
            "coverage": (
                "stock_actual / "
                "(demanda_30d / 30)"
            ),
            "uses_uncertainty": True,
        },
    }

    OUTPUT_METADATA.write_text(
        json.dumps(
            metadata,
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


# ============================================================
# Main
# ============================================================


def main() -> None:
    print(
        "=== ComercioBI - Fase 14 / "
        "Recomendaciones inteligentes de inventario ==="
    )
    print()

    engine = _create_engine()

    try:
        execution = _get_latest_ai_execution(
            engine
        )

        execution_id = int(
            execution["id"]
        )

        empresa_key = int(
            execution["empresa_key"]
        )

        print(
            f"Ejecución IA: {execution_id}"
        )
        print(
            f"Empresa: {empresa_key}"
        )
        print(
            "Modelo demanda: "
            f"{execution['algoritmo_demanda']}"
        )
        print(
            f"Origen: {execution['origen_datos']}"
        )
        print()

        demand = _load_demand_forecast(
            engine,
            execution_id,
        )

        inventory = _load_latest_inventory(
            engine,
            empresa_key,
        )

        print(
            f"Productos pronosticados: "
            f"{demand['producto_key'].nunique()}"
        )
        print(
            f"Posiciones inventario: "
            f"{len(inventory)}"
        )

        recommendations = (
            _generate_recommendations(
                inventory=inventory,
                demand=demand,
            )
        )

        _save_artifacts(
            recommendations,
            execution,
        )

        _persist_recommendations(
            engine=engine,
            recommendations=recommendations,
            execution_id=execution_id,
        )

        risk_counts = (
            recommendations["riesgo"]
            .value_counts()
            .to_dict()
        )

        print()
        print("--- Resultado ---")
        print(
            f"Recomendaciones: "
            f"{len(recommendations)}"
        )
        print(
            "Unidades sugeridas: "
            f"{recommendations['cantidad_sugerida'].sum():.0f}"
        )

        for risk in [
            "CRITICO",
            "ALTO",
            "MEDIO",
            "BAJO",
        ]:
            print(
                f"{risk}: "
                f"{risk_counts.get(risk, 0)}"
            )

        print()
        print("Artefactos:")
        print(f"- {OUTPUT_CSV}")
        print(f"- {OUTPUT_METADATA}")

        print()
        print(
            "Recomendaciones generadas y "
            "persistidas correctamente."
        )

    except Exception as exc:
        print()
        print("ERROR:")
        print(str(exc))
        raise SystemExit(1) from exc

    finally:
        engine.dispose()


if __name__ == "__main__":
    main()