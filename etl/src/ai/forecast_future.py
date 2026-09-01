from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .config import AI_OUTPUT_DIR, AISettings, ensure_ai_directories
from .features import (
    add_daily_demand_features,
    add_monthly_sales_features,
    build_daily_demand_panel,
    build_monthly_sales_panel,
)
from .train_xgboost import (
    DEMAND_CATEGORICAL,
    DEMAND_NUMERIC,
    SALES_CATEGORICAL,
    SALES_NUMERIC,
    build_direct_dataset,
    latest_origins,
    make_model,
    make_preprocessor,
)


def _load_csv(name: str, date_columns: tuple[str, ...] = ()) -> pd.DataFrame:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(
            f"No existe {path}. Ejecuta primero la preparación y evaluación de la Fase 14."
        )

    dataframe = pd.read_csv(path)

    for column in date_columns:
        if column in dataframe.columns:
            dataframe[column] = pd.to_datetime(dataframe[column])

    return dataframe


def _load_json(name: str) -> dict:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(
            f"No existe {path}. Ejecuta primero la preparación y evaluación de la Fase 14."
        )

    return json.loads(path.read_text(encoding="utf-8"))


def _validate_snapshot_consistency(
    dataset_metadata: dict,
    baseline_metadata: dict,
    model_comparison: dict,
) -> pd.Timestamp:
    dataset_origin = str(dataset_metadata["origin"])
    baseline_origin = str(baseline_metadata["origin"])
    comparison_origin = str(model_comparison["origin"])

    if len({dataset_origin, baseline_origin, comparison_origin}) != 1:
        raise RuntimeError(
            "Los artefactos de IA pertenecen a ejecuciones distintas. "
            "Vuelve a ejecutar preparación, features/baseline y entrenamiento."
        )

    dataset_reference = pd.Timestamp(dataset_metadata["reference_date"]).normalize()
    baseline_reference = pd.Timestamp(
        baseline_metadata["reference_date"]
    ).normalize()

    if dataset_reference != baseline_reference:
        raise RuntimeError(
            "dataset_metadata.json y feature_baseline_metadata.json "
            "tienen fechas de referencia distintas."
        )

    return dataset_reference


def _fit_full_direct_model(
    dataframe: pd.DataFrame,
    *,
    problem: str,
    date_col: str,
    target_col: str,
    horizon: int,
    categorical: list[str],
    numeric: list[str],
    seed: int,
    model_version: str,
) -> tuple[dict, pd.DataFrame, dict[int, np.ndarray]]:
    """
    Reentrena el modelo campeón con toda la historia disponible.

    El holdout ya fue usado únicamente para seleccionar el campeón.
    Para producción se aprovecha toda la historia observable y solo se
    construyen targets donde existe futuro conocido dentro del histórico.
    """
    X_train, y_train = build_direct_dataset(
        dataframe,
        date_col=date_col,
        target_col=target_col,
        horizon=horizon,
        categorical=categorical,
        numeric=numeric,
    )

    preprocessor = make_preprocessor(categorical, numeric)
    X_matrix = preprocessor.fit_transform(X_train)

    models = {}

    for h in range(1, horizon + 1):
        model = make_model(seed + h)
        model.fit(X_matrix, y_train[f"target_h{h}"].to_numpy())
        models[h] = model

    origins = latest_origins(dataframe, date_col)
    X_origin = origins[categorical + numeric].copy()
    X_origin_matrix = preprocessor.transform(X_origin)

    predictions_by_h = {
        h: np.maximum(
            models[h].predict(X_origin_matrix).astype(float),
            0.0,
        )
        for h in range(1, horizon + 1)
    }

    bundle = {
        "problem": problem,
        "strategy": "direct_multi_horizon",
        "production_retrained_on_full_history": True,
        "horizon": horizon,
        "target": target_col,
        "categorical_features": categorical,
        "numeric_features": numeric,
        "preprocessor": preprocessor,
        "models": models,
        "training_rows_supervised": int(len(X_train)),
        "model_version": model_version,
    }

    return bundle, origins, predictions_by_h


def _sales_baseline_future(
    monthly_panel: pd.DataFrame,
    *,
    horizon: int,
    model_version: str,
) -> pd.DataFrame:
    rows: list[dict] = []

    for _, product_data in monthly_panel.groupby(
        ["empresa_key", "producto_key"],
        sort=True,
    ):
        product_data = product_data.sort_values("periodo").reset_index(drop=True)

        last_row = product_data.iloc[-1]
        origin_period = pd.Timestamp(last_row["periodo"]).normalize()

        historical_map = {
            pd.Timestamp(row.periodo).normalize(): float(row.venta_neta)
            for row in product_data.itertuples()
        }

        fallback_value = float(last_row["venta_neta"])

        for h in range(1, horizon + 1):
            future_period = (
                origin_period + pd.DateOffset(months=h)
            ).normalize()

            previous_year_period = (
                future_period - pd.DateOffset(years=1)
            ).normalize()

            if previous_year_period in historical_map:
                predicted = historical_map[previous_year_period]
                model_name = "seasonal_naive_12m"
            else:
                predicted = fallback_value
                model_name = "last_observed_value"

            rows.append(
                {
                    "empresa_key": int(last_row["empresa_key"]),
                    "empresa": str(last_row["empresa"]),
                    "producto_key": int(last_row["producto_key"]),
                    "sku": str(last_row["sku"]),
                    "producto": str(last_row["producto"]),
                    "categoria": str(last_row["categoria"]),
                    "periodo_origen": origin_period,
                    "periodo": future_period,
                    "horizonte_meses": h,
                    "venta_neta_pronosticada": max(float(predicted), 0.0),
                    "modelo": model_name,
                    "origen_datos": str(last_row["origen_datos"]),
                    "model_version": model_version,
                }
            )

    return pd.DataFrame(rows).sort_values(
        ["empresa_key", "producto_key", "periodo"]
    ).reset_index(drop=True)


def _demand_baseline_future(
    daily_panel: pd.DataFrame,
    *,
    horizon: int,
    model_version: str,
) -> pd.DataFrame:
    rows: list[dict] = []

    for _, product_data in daily_panel.groupby(
        ["empresa_key", "producto_key"],
        sort=True,
    ):
        product_data = product_data.sort_values("fecha").reset_index(drop=True)

        last_row = product_data.iloc[-1]
        origin_date = pd.Timestamp(last_row["fecha"]).normalize()

        recent = product_data["unidades"].tail(7).astype(float).tolist()

        if not recent:
            recent = [0.0]

        while len(recent) < 7:
            recent = recent + recent

        weekly_pattern = recent[-7:]

        for h in range(1, horizon + 1):
            future_date = origin_date + pd.Timedelta(days=h)
            predicted = weekly_pattern[(h - 1) % 7]

            rows.append(
                {
                    "empresa_key": int(last_row["empresa_key"]),
                    "empresa": str(last_row["empresa"]),
                    "producto_key": int(last_row["producto_key"]),
                    "sku": str(last_row["sku"]),
                    "producto": str(last_row["producto"]),
                    "categoria": str(last_row["categoria"]),
                    "fecha_origen": origin_date,
                    "fecha": future_date,
                    "horizonte_dias": h,
                    "unidades_pronosticadas": max(float(predicted), 0.0),
                    "modelo": "weekly_naive_repeat_7d",
                    "origen_datos": str(last_row["origen_datos"]),
                    "model_version": model_version,
                }
            )

    return pd.DataFrame(rows).sort_values(
        ["empresa_key", "producto_key", "fecha"]
    ).reset_index(drop=True)


def _xgboost_sales_future(
    origins: pd.DataFrame,
    predictions_by_h: dict[int, np.ndarray],
    *,
    horizon: int,
    model_version: str,
) -> pd.DataFrame:
    rows: list[dict] = []

    for origin_index, origin in origins.reset_index(drop=True).iterrows():
        origin_period = pd.Timestamp(origin["periodo"]).normalize()

        for h in range(1, horizon + 1):
            rows.append(
                {
                    "empresa_key": int(origin["empresa_key"]),
                    "empresa": str(origin["empresa"]),
                    "producto_key": int(origin["producto_key"]),
                    "sku": str(origin["sku"]),
                    "producto": str(origin["producto"]),
                    "categoria": str(origin["categoria"]),
                    "periodo_origen": origin_period,
                    "periodo": (
                        origin_period + pd.DateOffset(months=h)
                    ).normalize(),
                    "horizonte_meses": h,
                    "venta_neta_pronosticada": float(
                        predictions_by_h[h][origin_index]
                    ),
                    "modelo": "xgboost_direct_full",
                    "origen_datos": str(origin["origen_datos"]),
                    "model_version": model_version,
                }
            )

    return pd.DataFrame(rows).sort_values(
        ["empresa_key", "producto_key", "periodo"]
    ).reset_index(drop=True)


def _xgboost_demand_future(
    origins: pd.DataFrame,
    predictions_by_h: dict[int, np.ndarray],
    *,
    horizon: int,
    model_version: str,
) -> pd.DataFrame:
    rows: list[dict] = []

    for origin_index, origin in origins.reset_index(drop=True).iterrows():
        origin_date = pd.Timestamp(origin["fecha"]).normalize()

        for h in range(1, horizon + 1):
            rows.append(
                {
                    "empresa_key": int(origin["empresa_key"]),
                    "empresa": str(origin["empresa"]),
                    "producto_key": int(origin["producto_key"]),
                    "sku": str(origin["sku"]),
                    "producto": str(origin["producto"]),
                    "categoria": str(origin["categoria"]),
                    "fecha_origen": origin_date,
                    "fecha": origin_date + pd.Timedelta(days=h),
                    "horizonte_dias": h,
                    "unidades_pronosticadas": float(
                        predictions_by_h[h][origin_index]
                    ),
                    "modelo": "xgboost_direct_full",
                    "origen_datos": str(origin["origen_datos"]),
                    "model_version": model_version,
                }
            )

    return pd.DataFrame(rows).sort_values(
        ["empresa_key", "producto_key", "fecha"]
    ).reset_index(drop=True)


def _validate_future_ranges(
    sales_forecast: pd.DataFrame,
    demand_forecast: pd.DataFrame,
    reference_date: pd.Timestamp,
) -> None:
    if sales_forecast.empty or demand_forecast.empty:
        raise RuntimeError("Los pronósticos futuros no pueden quedar vacíos.")

    sales_forecast["periodo"] = pd.to_datetime(sales_forecast["periodo"])
    demand_forecast["fecha"] = pd.to_datetime(demand_forecast["fecha"])

    if (sales_forecast["periodo"] <= reference_date).any():
        raise RuntimeError(
            "El pronóstico de ventas contiene periodos que no son futuros."
        )

    if (demand_forecast["fecha"] <= reference_date).any():
        raise RuntimeError(
            "El pronóstico de demanda contiene fechas que no son futuras."
        )

    if (sales_forecast["venta_neta_pronosticada"] < 0).any():
        raise RuntimeError("El pronóstico de ventas contiene valores negativos.")

    if (demand_forecast["unidades_pronosticadas"] < 0).any():
        raise RuntimeError("El pronóstico de demanda contiene valores negativos.")


def run() -> int:
    settings = AISettings()
    ensure_ai_directories()

    try:
        dataset_metadata = _load_json("dataset_metadata.json")
        baseline_metadata = _load_json("feature_baseline_metadata.json")
        model_comparison = _load_json("model_comparison.json")

        reference_date = _validate_snapshot_consistency(
            dataset_metadata,
            baseline_metadata,
            model_comparison,
        )

        sales_history = _load_csv(
            "dataset_ventas_ai.csv",
            date_columns=("fecha",),
        )
        inventory = _load_csv(
            "dataset_inventario_ai.csv",
            date_columns=("fecha",),
        )

        monthly_panel = build_monthly_sales_panel(
            sales_history,
            inventory,
        )
        daily_panel = build_daily_demand_panel(
            sales_history,
            inventory,
        )

        monthly_features = add_monthly_sales_features(monthly_panel)
        daily_features = add_daily_demand_features(daily_panel)

        sales_champion = str(
            model_comparison["sales"]["champion"]
        ).lower()

        demand_champion = str(
            model_comparison["demand"]["champion"]
        ).lower()

        models_dir = AI_OUTPUT_DIR / "models"
        models_dir.mkdir(parents=True, exist_ok=True)

        sales_retrained = False
        demand_retrained = False

        if sales_champion == "baseline":
            sales_forecast = _sales_baseline_future(
                monthly_panel,
                horizon=settings.sales_horizon_months,
                model_version=settings.model_version,
            )
        elif sales_champion == "xgboost":
            sales_bundle, sales_origins, sales_predictions = (
                _fit_full_direct_model(
                    monthly_features,
                    problem="sales",
                    date_col="periodo",
                    target_col="venta_neta",
                    horizon=settings.sales_horizon_months,
                    categorical=SALES_CATEGORICAL,
                    numeric=SALES_NUMERIC,
                    seed=settings.random_seed,
                    model_version=settings.model_version,
                )
            )

            joblib.dump(
                sales_bundle,
                models_dir / "sales_xgboost_production.joblib",
                compress=3,
            )

            sales_forecast = _xgboost_sales_future(
                sales_origins,
                sales_predictions,
                horizon=settings.sales_horizon_months,
                model_version=settings.model_version,
            )

            sales_retrained = True
        else:
            raise RuntimeError(
                f"Campeón de ventas no soportado: {sales_champion}"
            )

        if demand_champion == "baseline":
            demand_forecast = _demand_baseline_future(
                daily_panel,
                horizon=settings.demand_horizon_days,
                model_version=settings.model_version,
            )
        elif demand_champion == "xgboost":
            demand_bundle, demand_origins, demand_predictions = (
                _fit_full_direct_model(
                    daily_features,
                    problem="demand",
                    date_col="fecha",
                    target_col="unidades",
                    horizon=settings.demand_horizon_days,
                    categorical=DEMAND_CATEGORICAL,
                    numeric=DEMAND_NUMERIC,
                    seed=settings.random_seed + 378,
                    model_version=settings.model_version,
                )
            )

            joblib.dump(
                demand_bundle,
                models_dir / "demand_xgboost_production.joblib",
                compress=3,
            )

            demand_forecast = _xgboost_demand_future(
                demand_origins,
                demand_predictions,
                horizon=settings.demand_horizon_days,
                model_version=settings.model_version,
            )

            demand_retrained = True
        else:
            raise RuntimeError(
                f"Campeón de demanda no soportado: {demand_champion}"
            )

        _validate_future_ranges(
            sales_forecast,
            demand_forecast,
            reference_date,
        )

        sales_path = AI_OUTPUT_DIR / "future_sales_forecast.csv"
        demand_path = AI_OUTPUT_DIR / "future_demand_forecast.csv"
        metadata_path = AI_OUTPUT_DIR / "future_forecast_metadata.json"

        sales_forecast.to_csv(
            sales_path,
            index=False,
            encoding="utf-8-sig",
        )

        demand_forecast.to_csv(
            demand_path,
            index=False,
            encoding="utf-8-sig",
        )

        metadata = {
            "origin": str(dataset_metadata["origin"]),
            "model_version": settings.model_version,
            "reference_date": reference_date.date().isoformat(),
            "source_artifacts": {
                "dataset_metadata": "dataset_metadata.json",
                "feature_baseline_metadata": "feature_baseline_metadata.json",
                "model_comparison": "model_comparison.json",
            },
            "sales": {
                "champion": sales_champion,
                "horizon_months": settings.sales_horizon_months,
                "rows": int(len(sales_forecast)),
                "forecast_start": pd.Timestamp(
                    sales_forecast["periodo"].min()
                ).date().isoformat(),
                "forecast_end": pd.Timestamp(
                    sales_forecast["periodo"].max()
                ).date().isoformat(),
                "production_model_retrained_on_full_history": sales_retrained,
            },
            "demand": {
                "champion": demand_champion,
                "horizon_days": settings.demand_horizon_days,
                "rows": int(len(demand_forecast)),
                "forecast_start": pd.Timestamp(
                    demand_forecast["fecha"].min()
                ).date().isoformat(),
                "forecast_end": pd.Timestamp(
                    demand_forecast["fecha"].max()
                ).date().isoformat(),
                "production_model_retrained_on_full_history": demand_retrained,
            },
            "persistence": {
                "postgresql_written": False,
                "reason": (
                    "La persistencia se realizará en el siguiente bloque "
                    "de la Fase 14, después de validar los forecasts."
                ),
            },
        }

        metadata_path.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print()
        print("=== ComercioBI - Fase 14 / Pronósticos futuros ===")
        print(f"Fecha de referencia: {reference_date.date().isoformat()}")
        print(f"Origen de datos: {dataset_metadata['origin']}")
        print()
        print(
            "Ventas | campeón="
            f"{sales_champion.upper()} | "
            f"filas={len(sales_forecast)} | "
            f"{metadata['sales']['forecast_start']} -> "
            f"{metadata['sales']['forecast_end']}"
        )
        print(
            "Demanda | campeón="
            f"{demand_champion.upper()} | "
            f"filas={len(demand_forecast)} | "
            f"{metadata['demand']['forecast_start']} -> "
            f"{metadata['demand']['forecast_end']}"
        )
        print()
        print("Artefactos generados:")
        print(f"- {sales_path}")
        print(f"- {demand_path}")
        print(f"- {metadata_path}")
        print()
        print("Persistencia PostgreSQL realizada: False")
        print("Pronósticos futuros generados correctamente.")
        return 0

    except (RuntimeError, ValueError, KeyError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            f"ERROR inesperado al generar pronósticos futuros: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
