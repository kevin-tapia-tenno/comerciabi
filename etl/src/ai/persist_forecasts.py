from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine


# ============================================================
# Resolución de rutas
# ============================================================

AI_DIR = Path(__file__).resolve().parent
SRC_DIR = AI_DIR.parent
ETL_DIR = SRC_DIR.parent
PROJECT_DIR = ETL_DIR.parent

OUTPUT_AI_DIR = ETL_DIR / "output" / "ai"

SALES_FORECAST_PATH = OUTPUT_AI_DIR / "future_sales_forecast.csv"
DEMAND_FORECAST_PATH = OUTPUT_AI_DIR / "future_demand_forecast.csv"
FORECAST_METADATA_PATH = OUTPUT_AI_DIR / "future_forecast_metadata.json"
MODEL_COMPARISON_PATH = OUTPUT_AI_DIR / "model_comparison.json"
FEATURE_METADATA_PATH = OUTPUT_AI_DIR / "feature_baseline_metadata.json"
INTERVAL_CALIBRATION_PATH = OUTPUT_AI_DIR / "interval_calibration.json"

if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

from src.config import load_database_config  # noqa: E402


# ============================================================
# Excepciones
# ============================================================


class PersistenceError(RuntimeError):
    """Error durante la persistencia de resultados de IA."""


# ============================================================
# Utilidades
# ============================================================


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise PersistenceError(
            f"No existe el artefacto requerido: {path}"
        )

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise PersistenceError(
            f"No se pudo leer el JSON: {path}"
        ) from exc


def _require_file(path: Path) -> None:
    if not path.exists():
        raise PersistenceError(
            f"No existe el archivo requerido: {path}"
        )


def _normalize_model_name(value: Any) -> str:
    value = str(value).strip()

    if not value:
        raise PersistenceError(
            "Se encontró un modelo vacío en los pronósticos."
        )

    return value


def _normalize_origin(value: Any) -> str:
    origin = str(value).strip().upper()

    if origin not in {"REAL", "DEMO"}:
        raise PersistenceError(
            f"Origen de datos inválido: {origin}"
        )

    return origin


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass

    return float(value)


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default

    try:
        if pd.isna(value):
            return default
    except TypeError:
        pass

    return int(value)


def _read_csv(path: Path) -> pd.DataFrame:
    _require_file(path)

    try:
        return pd.read_csv(path)
    except Exception as exc:
        raise PersistenceError(
            f"No se pudo leer el CSV: {path}"
        ) from exc


# ============================================================
# Validaciones de entrada
# ============================================================


def _validate_sales(df: pd.DataFrame) -> None:
    required = {
        "empresa_key",
        "producto_key",
        "periodo",
        "venta_neta_pronosticada",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
    }

    missing = required - set(df.columns)

    if missing:
        raise PersistenceError(
            "Faltan columnas en future_sales_forecast.csv: "
            + ", ".join(sorted(missing))
        )

    if df.empty:
        raise PersistenceError(
            "future_sales_forecast.csv no contiene filas."
        )

    if (
        pd.to_numeric(df["venta_neta_pronosticada"], errors="coerce")
        < 0
    ).any():
        raise PersistenceError(
            "Existen ventas pronosticadas negativas."
        )

    lower = pd.to_numeric(
        df["limite_inferior"],
        errors="coerce",
    )
    prediction = pd.to_numeric(
        df["venta_neta_pronosticada"],
        errors="coerce",
    )
    upper = pd.to_numeric(
        df["limite_superior"],
        errors="coerce",
    )

    invalid_interval = (
        lower.isna()
        | prediction.isna()
        | upper.isna()
        | (lower < 0)
        | (upper < 0)
        | (lower > prediction)
        | (prediction > upper)
    )

    if invalid_interval.any():
        raise PersistenceError(
            "Existen intervalos inválidos en pronósticos de ventas."
        )

    duplicates = df.duplicated(
        subset=[
            "empresa_key",
            "producto_key",
            "periodo",
        ]
    ).sum()

    if duplicates:
        raise PersistenceError(
            f"Existen {duplicates} pronósticos de ventas duplicados."
        )


def _validate_demand(df: pd.DataFrame) -> None:
    required = {
        "empresa_key",
        "producto_key",
        "fecha",
        "horizonte_dias",
        "unidades_pronosticadas",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
    }

    missing = required - set(df.columns)

    if missing:
        raise PersistenceError(
            "Faltan columnas en future_demand_forecast.csv: "
            + ", ".join(sorted(missing))
        )

    if df.empty:
        raise PersistenceError(
            "future_demand_forecast.csv no contiene filas."
        )

    units = pd.to_numeric(
        df["unidades_pronosticadas"],
        errors="coerce",
    )

    lower = pd.to_numeric(
        df["limite_inferior"],
        errors="coerce",
    )

    upper = pd.to_numeric(
        df["limite_superior"],
        errors="coerce",
    )

    invalid_interval = (
        units.isna()
        | lower.isna()
        | upper.isna()
        | (units < 0)
        | (lower < 0)
        | (upper < 0)
        | (lower > units)
        | (units > upper)
    )

    if invalid_interval.any():
        raise PersistenceError(
            "Existen intervalos inválidos en pronósticos de demanda."
        )

    duplicates = df.duplicated(
        subset=[
            "empresa_key",
            "producto_key",
            "fecha",
        ]
    ).sum()

    if duplicates:
        raise PersistenceError(
            f"Existen {duplicates} pronósticos de demanda duplicados."
        )


# ============================================================
# Base de datos
# ============================================================


def _create_engine() -> Engine:
    config = load_database_config()

    return create_engine(
        config.sqlalchemy_url(),
        pool_pre_ping=True,
    )


def _validate_dimension_keys(
    engine: Engine,
    sales: pd.DataFrame,
    demand: pd.DataFrame,
) -> None:
    empresa_keys = sorted(
        set(
            pd.concat(
                [
                    sales["empresa_key"],
                    demand["empresa_key"],
                ]
            )
            .astype(int)
            .tolist()
        )
    )

    producto_keys = sorted(
        set(
            pd.concat(
                [
                    sales["producto_key"],
                    demand["producto_key"],
                ]
            )
            .astype(int)
            .tolist()
        )
    )

    with engine.connect() as conn:
        db_empresas = {
            int(row[0])
            for row in conn.execute(
                text(
                    """
                    select empresa_key
                    from analytics.dim_empresa
                    where empresa_key = any(:keys)
                    """
                ),
                {"keys": empresa_keys},
            )
        }

        db_productos = {
            int(row[0])
            for row in conn.execute(
                text(
                    """
                    select producto_key
                    from analytics.dim_producto
                    where producto_key = any(:keys)
                    """
                ),
                {"keys": producto_keys},
            )
        }

    missing_empresas = set(empresa_keys) - db_empresas
    missing_productos = set(producto_keys) - db_productos

    if missing_empresas:
        raise PersistenceError(
            "empresa_key inexistentes en analytics.dim_empresa: "
            + ", ".join(map(str, sorted(missing_empresas)))
        )

    if missing_productos:
        raise PersistenceError(
            "producto_key inexistentes en analytics.dim_producto: "
            + ", ".join(map(str, sorted(missing_productos)))
        )


# ============================================================
# Metadata de ejecución
# ============================================================


def _build_execution_metadata(
    forecast_metadata: dict[str, Any],
    comparison: dict[str, Any],
    feature_metadata: dict[str, Any],
    interval_metadata: dict[str, Any],
) -> dict[str, Any]:
    return {
        "fase": "14",
        "bloque": "14.11D",
        "forecast": forecast_metadata,
        "evaluation": {
            "sales": comparison.get("sales", {}),
            "demand": comparison.get("demand", {}),
        },
        "feature_baseline": feature_metadata,
        "uncertainty": interval_metadata,
        "persisted_at_utc": datetime.now(
            timezone.utc
        ).isoformat(),
    }


# ============================================================
# Persistencia
# ============================================================


def persist_forecasts() -> int:
    sales = _read_csv(SALES_FORECAST_PATH)
    demand = _read_csv(DEMAND_FORECAST_PATH)

    forecast_metadata = _load_json(
        FORECAST_METADATA_PATH
    )
    comparison = _load_json(
        MODEL_COMPARISON_PATH
    )
    feature_metadata = _load_json(
        FEATURE_METADATA_PATH
    )
    interval_metadata = _load_json(
        INTERVAL_CALIBRATION_PATH
    )

    _validate_sales(sales)
    _validate_demand(demand)

    origin = _normalize_origin(
        forecast_metadata.get("origin")
        or sales.iloc[0]["origen_datos"]
    )

    sales_models = {
        _normalize_model_name(x)
        for x in sales["modelo"].dropna().unique()
    }

    demand_models = {
        _normalize_model_name(x)
        for x in demand["modelo"].dropna().unique()
    }

    if len(sales_models) != 1:
        raise PersistenceError(
            "Se esperaba exactamente un modelo campeón de ventas."
        )

    if len(demand_models) != 1:
        raise PersistenceError(
            "Se esperaba exactamente un modelo campeón de demanda."
        )

    sales_model = next(iter(sales_models))
    demand_model = next(iter(demand_models))

    sales_metadata = comparison.get("sales", {})
    demand_metadata = comparison.get("demand", {})

    sales_baseline = sales_metadata.get(
        "baseline_metrics",
        {},
    )
    sales_xgboost = sales_metadata.get(
        "xgboost_metrics",
        {},
    )

    demand_baseline = demand_metadata.get(
        "baseline_metrics",
        {},
    )
    demand_xgboost = demand_metadata.get(
        "xgboost_metrics",
        {},
    )

    sales_champion = str(
        sales_metadata.get("champion", "baseline")
    ).lower()

    demand_champion = str(
        demand_metadata.get("champion", "xgboost")
    ).lower()

    mae_sales = (
        sales_xgboost.get("mae")
        if sales_champion == "xgboost"
        else sales_baseline.get("mae")
    )

    mae_demand = (
        demand_xgboost.get("mae")
        if demand_champion == "xgboost"
        else demand_baseline.get("mae")
    )

    mae_sales_baseline = sales_baseline.get("mae")
    mae_demand_baseline = demand_baseline.get("mae")

    sales_feature_meta = feature_metadata.get(
        "sales",
        {},
    )
    demand_feature_meta = feature_metadata.get(
        "demand",
        {},
    )

    sales_training_rows = _safe_int(
        sales_feature_meta.get("training_rows")
    )

    demand_training_rows = _safe_int(
        demand_feature_meta.get("training_rows")
    )

    model_version = str(
        forecast_metadata.get(
            "model_version",
            "fase14-v1",
        )
    )

    empresa_keys = set(
        pd.concat(
            [
                sales["empresa_key"],
                demand["empresa_key"],
            ]
        )
        .astype(int)
        .tolist()
    )

    if len(empresa_keys) != 1:
        raise PersistenceError(
            "La ejecución actual debe corresponder a una sola empresa."
        )

    empresa_key = next(iter(empresa_keys))

    metadata = _build_execution_metadata(
        forecast_metadata=forecast_metadata,
        comparison=comparison,
        feature_metadata=feature_metadata,
        interval_metadata=interval_metadata,
    )

    engine = _create_engine()

    _validate_dimension_keys(
        engine=engine,
        sales=sales,
        demand=demand,
    )

    execution_id: int | None = None

    try:
        # ----------------------------------------------------
        # 1. Crear bitácora EJECUTANDO
        # ----------------------------------------------------
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    insert into analytics.ai_ejecuciones (
                        empresa_key,
                        estado,
                        origen_datos,
                        algoritmo_ventas,
                        algoritmo_demanda,
                        mae_ventas,
                        mae_ventas_baseline,
                        mae_demanda,
                        mae_demanda_baseline,
                        filas_entrenamiento_ventas,
                        filas_entrenamiento_demanda,
                        periodo_inicio,
                        periodo_fin,
                        version_modelo,
                        metadata,
                        mensaje,
                        creado_por
                    )
                    values (
                        :empresa_key,
                        'EJECUTANDO',
                        :origen_datos,
                        :algoritmo_ventas,
                        :algoritmo_demanda,
                        :mae_ventas,
                        :mae_ventas_baseline,
                        :mae_demanda,
                        :mae_demanda_baseline,
                        :filas_entrenamiento_ventas,
                        :filas_entrenamiento_demanda,
                        null,
                        null,
                        :version_modelo,
                        cast(:metadata as jsonb),
                        :mensaje,
                        'python-ai'
                    )
                    returning id
                    """
                ),
                {
                    "empresa_key": empresa_key,
                    "origen_datos": origin,
                    "algoritmo_ventas": sales_model,
                    "algoritmo_demanda": demand_model,
                    "mae_ventas": _safe_float(mae_sales),
                    "mae_ventas_baseline": _safe_float(
                        mae_sales_baseline
                    ),
                    "mae_demanda": _safe_float(mae_demand),
                    "mae_demanda_baseline": _safe_float(
                        mae_demand_baseline
                    ),
                    "filas_entrenamiento_ventas": (
                        sales_training_rows
                    ),
                    "filas_entrenamiento_demanda": (
                        demand_training_rows
                    ),
                    "version_modelo": model_version,
                    "metadata": json.dumps(
                        metadata,
                        ensure_ascii=False,
                    ),
                    "mensaje": (
                        "Persistencia de pronósticos "
                        "Fase 14 iniciada."
                    ),
                },
            )

            execution_id = int(result.scalar_one())

        # ----------------------------------------------------
        # 2. Persistir pronósticos
        # ----------------------------------------------------
        with engine.begin() as conn:
            sales_rows: list[dict[str, Any]] = []

            for row in sales.to_dict(
                orient="records"
            ):
                sales_rows.append(
                    {
                        "ai_ejecucion_id": execution_id,
                        "empresa_key": int(
                            row["empresa_key"]
                        ),
                        "producto_key": int(
                            row["producto_key"]
                        ),
                        "periodo": pd.to_datetime(
                            row["periodo"]
                        ).date(),
                        "venta_neta_pronosticada": float(
                            row[
                                "venta_neta_pronosticada"
                            ]
                        ),
                        "limite_inferior": float(
                            row["limite_inferior"]
                        ),
                        "limite_superior": float(
                            row["limite_superior"]
                        ),
                        "modelo": _normalize_model_name(
                            row["modelo"]
                        ),
                        "origen_datos": _normalize_origin(
                            row["origen_datos"]
                        ),
                    }
                )

            conn.execute(
                text(
                    """
                    insert into analytics.ai_pronostico_ventas (
                        ai_ejecucion_id,
                        empresa_key,
                        producto_key,
                        periodo,
                        venta_neta_pronosticada,
                        limite_inferior,
                        limite_superior,
                        modelo,
                        origen_datos
                    )
                    values (
                        :ai_ejecucion_id,
                        :empresa_key,
                        :producto_key,
                        :periodo,
                        :venta_neta_pronosticada,
                        :limite_inferior,
                        :limite_superior,
                        :modelo,
                        :origen_datos
                    )
                    """
                ),
                sales_rows,
            )

            demand_rows: list[dict[str, Any]] = []

            for row in demand.to_dict(
                orient="records"
            ):
                forecast_date = pd.to_datetime(
                    row["fecha"]
                ).date()

                forecast_origin = pd.to_datetime(
                    row.get(
                        "fecha_origen",
                        forecast_metadata.get(
                            "reference_date"
                        ),
                    )
                ).date()

                demand_rows.append(
                    {
                        "ai_ejecucion_id": execution_id,
                        "empresa_key": int(
                            row["empresa_key"]
                        ),
                        "producto_key": int(
                            row["producto_key"]
                        ),
                        "fecha_inicio": forecast_date,
                        "fecha_fin": forecast_date,
                        "horizonte_dias": int(
                            row["horizonte_dias"]
                        ),
                        "unidades_pronosticadas": float(
                            row[
                                "unidades_pronosticadas"
                            ]
                        ),
                        "limite_inferior": float(
                            row["limite_inferior"]
                        ),
                        "limite_superior": float(
                            row["limite_superior"]
                        ),
                        "modelo": _normalize_model_name(
                            row["modelo"]
                        ),
                        "origen_datos": _normalize_origin(
                            row["origen_datos"]
                        ),
                    }
                )

            conn.execute(
                text(
                    """
                    insert into analytics.ai_pronostico_demanda (
                        ai_ejecucion_id,
                        empresa_key,
                        producto_key,
                        fecha_inicio,
                        fecha_fin,
                        horizonte_dias,
                        unidades_pronosticadas,
                        limite_inferior,
                        limite_superior,
                        modelo,
                        origen_datos
                    )
                    values (
                        :ai_ejecucion_id,
                        :empresa_key,
                        :producto_key,
                        :fecha_inicio,
                        :fecha_fin,
                        :horizonte_dias,
                        :unidades_pronosticadas,
                        :limite_inferior,
                        :limite_superior,
                        :modelo,
                        :origen_datos
                    )
                    """
                ),
                demand_rows,
            )

            conn.execute(
                text(
                    """
                    update analytics.ai_ejecuciones
                    set
                        estado = 'COMPLETADA',
                        finalizado_en = now(),
                        mensaje = :mensaje
                    where id = :execution_id
                    """
                ),
                {
                    "execution_id": execution_id,
                    "mensaje": (
                        "Pronósticos de ventas y demanda "
                        "persistidos correctamente."
                    ),
                },
            )

        print()
        print(
            "Persistencia PostgreSQL completada correctamente."
        )
        print(f"Ejecución IA: {execution_id}")
        print(
            f"Pronósticos de ventas: {len(sales)}"
        )
        print(
            f"Pronósticos de demanda: {len(demand)}"
        )
        print(f"Origen: {origin}")
        print(f"Modelo ventas: {sales_model}")
        print(f"Modelo demanda: {demand_model}")

        return execution_id

    except Exception as exc:
        if execution_id is not None:
            try:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            """
                            update analytics.ai_ejecuciones
                            set
                                estado = 'FALLIDA',
                                finalizado_en = now(),
                                mensaje = :mensaje
                            where id = :execution_id
                            """
                        ),
                        {
                            "execution_id": execution_id,
                            "mensaje": str(exc)[:1000],
                        },
                    )
            except Exception:
                pass

        raise

    finally:
        engine.dispose()


def main() -> None:
    print(
        "=== ComercioBI - Fase 14 / "
        "Persistencia PostgreSQL IA ==="
    )
    print()

    try:
        persist_forecasts()
    except Exception as exc:
        print()
        print("ERROR:")
        print(str(exc))
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()