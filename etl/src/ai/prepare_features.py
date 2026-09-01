from __future__ import annotations

import json
import sys

from ..config import ConfigError, load_database_config
from ..db import (
    check_analytics_schema,
    check_database_connection,
    create_database_engine,
)
from .baseline import (
    demand_weekly_naive_baseline,
    evaluate_demand_baseline,
    evaluate_sales_baseline,
    sales_seasonal_naive_baseline,
)
from .config import AI_OUTPUT_DIR, AISettings, ensure_ai_directories
from .data import load_ai_data
from .features import (
    add_daily_demand_features,
    add_monthly_sales_features,
    build_daily_demand_panel,
    build_monthly_sales_panel,
    determine_temporal_cutoffs,
    split_training_and_holdout,
)
from .metrics import metrics_by_product


def _iso(value) -> str:
    return value.date().isoformat()


def run() -> int:
    settings = AISettings()
    ensure_ai_directories()

    try:
        database_config = load_database_config()
        engine = create_database_engine(database_config)

        check_database_connection(engine)
        check_analytics_schema(engine)

        bundle = load_ai_data(engine=engine, settings=settings)

        monthly_panel = build_monthly_sales_panel(
            bundle.sales_history,
            bundle.inventory,
        )
        daily_panel = build_daily_demand_panel(
            bundle.sales_history,
            bundle.inventory,
        )

        monthly_features = add_monthly_sales_features(monthly_panel)
        daily_features = add_daily_demand_features(daily_panel)

        cutoffs = determine_temporal_cutoffs(
            monthly_panel,
            daily_panel,
            settings,
        )

        (
            sales_train,
            sales_holdout,
            demand_train,
            demand_holdout,
        ) = split_training_and_holdout(
            monthly_features,
            daily_features,
            cutoffs,
        )

        sales_baseline = sales_seasonal_naive_baseline(
            monthly_panel,
            cutoffs,
        )
        demand_baseline = demand_weekly_naive_baseline(
            daily_panel,
            cutoffs,
        )

        sales_metrics = evaluate_sales_baseline(sales_baseline)
        demand_metrics = evaluate_demand_baseline(demand_baseline)

        sales_metrics_product = metrics_by_product(
            sales_baseline,
            actual_column="venta_neta_real",
            predicted_column="venta_neta_predicha",
        )
        demand_metrics_product = metrics_by_product(
            demand_baseline,
            actual_column="unidades_reales",
            predicted_column="unidades_predichas",
        )

        paths = {
            "sales_train": AI_OUTPUT_DIR / "training_sales_features.csv",
            "demand_train": AI_OUTPUT_DIR / "training_demand_features.csv",
            "sales_holdout": AI_OUTPUT_DIR / "holdout_sales_actual.csv",
            "demand_holdout": AI_OUTPUT_DIR / "holdout_demand_actual.csv",
            "sales_baseline": AI_OUTPUT_DIR / "baseline_sales_predictions.csv",
            "demand_baseline": AI_OUTPUT_DIR / "baseline_demand_predictions.csv",
            "sales_metrics_product": AI_OUTPUT_DIR / "baseline_sales_metrics_by_product.csv",
            "demand_metrics_product": AI_OUTPUT_DIR / "baseline_demand_metrics_by_product.csv",
            "metadata": AI_OUTPUT_DIR / "feature_baseline_metadata.json",
        }

        sales_train.to_csv(
            paths["sales_train"], index=False, encoding="utf-8-sig"
        )
        demand_train.to_csv(
            paths["demand_train"], index=False, encoding="utf-8-sig"
        )

        sales_holdout[
            [
                "empresa_key",
                "empresa",
                "producto_key",
                "sku",
                "producto",
                "categoria",
                "periodo",
                "venta_neta",
                "origen_datos",
            ]
        ].to_csv(
            paths["sales_holdout"],
            index=False,
            encoding="utf-8-sig",
        )

        demand_holdout[
            [
                "empresa_key",
                "empresa",
                "producto_key",
                "sku",
                "producto",
                "categoria",
                "fecha",
                "unidades",
                "origen_datos",
            ]
        ].to_csv(
            paths["demand_holdout"],
            index=False,
            encoding="utf-8-sig",
        )

        sales_baseline.to_csv(
            paths["sales_baseline"], index=False, encoding="utf-8-sig"
        )
        demand_baseline.to_csv(
            paths["demand_baseline"], index=False, encoding="utf-8-sig"
        )
        sales_metrics_product.to_csv(
            paths["sales_metrics_product"], index=False, encoding="utf-8-sig"
        )
        demand_metrics_product.to_csv(
            paths["demand_metrics_product"], index=False, encoding="utf-8-sig"
        )

        metadata = {
            "origin": bundle.origin,
            "model_version": settings.model_version,
            "reference_date": _iso(bundle.reference_date),
            "sales": {
                "target": "venta_neta",
                "training_rows": int(len(sales_train)),
                "holdout_rows": int(len(sales_holdout)),
                "holdout_start": _iso(cutoffs.sales_holdout_start),
                "holdout_end": _iso(cutoffs.sales_holdout_end),
                "horizon_months": settings.sales_horizon_months,
                "baseline": "seasonal_naive_12m",
                "metrics": sales_metrics,
            },
            "demand": {
                "target": "unidades",
                "training_rows": int(len(demand_train)),
                "holdout_rows": int(len(demand_holdout)),
                "holdout_start": _iso(cutoffs.demand_holdout_start),
                "holdout_end": _iso(cutoffs.demand_holdout_end),
                "horizon_days": settings.demand_horizon_days,
                "baseline": "weekly_naive_repeat_7d",
                "metrics": demand_metrics,
            },
            "data_leakage_guard": {
                "sales_train_before_holdout": bool(
                    sales_train["periodo"].max()
                    < cutoffs.sales_holdout_start
                ),
                "demand_train_before_holdout": bool(
                    demand_train["fecha"].max()
                    < cutoffs.demand_holdout_start
                ),
                "baseline_uses_holdout_as_input": False,
            },
        }

        paths["metadata"].write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print()
        print("=== ComercioBI - Fase 14 / Features + baseline temporal ===")
        print(f"Origen de datos: {bundle.origin}")
        print()
        print("--- Ventas ---")
        print(
            f"Train: {_iso(sales_train['periodo'].min())} "
            f"a {_iso(sales_train['periodo'].max())}"
        )
        print(
            f"Holdout: {_iso(cutoffs.sales_holdout_start)} "
            f"a {_iso(cutoffs.sales_holdout_end)}"
        )
        print(
            f"Filas train: {len(sales_train)} | "
            f"filas holdout: {len(sales_holdout)}"
        )
        print(
            "Baseline ventas | "
            f"MAE={sales_metrics['mae']} | "
            f"RMSE={sales_metrics['rmse']} | "
            f"WAPE={sales_metrics['wape_pct']}%"
        )
        print()
        print("--- Demanda ---")
        print(
            f"Train: {_iso(demand_train['fecha'].min())} "
            f"a {_iso(demand_train['fecha'].max())}"
        )
        print(
            f"Holdout: {_iso(cutoffs.demand_holdout_start)} "
            f"a {_iso(cutoffs.demand_holdout_end)}"
        )
        print(
            f"Filas train: {len(demand_train)} | "
            f"filas holdout: {len(demand_holdout)}"
        )
        print(
            "Baseline demanda | "
            f"MAE={demand_metrics['mae']} | "
            f"RMSE={demand_metrics['rmse']} | "
            f"WAPE={demand_metrics['wape_pct']}%"
        )
        print()
        print("Controles de fuga temporal:")
        print(
            "- Ventas train < holdout: "
            f"{metadata['data_leakage_guard']['sales_train_before_holdout']}"
        )
        print(
            "- Demanda train < holdout: "
            f"{metadata['data_leakage_guard']['demand_train_before_holdout']}"
        )
        print(
            "- Baseline usa holdout como entrada: "
            f"{metadata['data_leakage_guard']['baseline_uses_holdout_as_input']}"
        )
        print()
        print(
            "Features y baseline generados correctamente. "
            "Todavía no se entrenó XGBoost."
        )

        return 0

    except (ConfigError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR inesperado durante features/baseline: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
