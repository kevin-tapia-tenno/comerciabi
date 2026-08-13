from __future__ import annotations

import json
import sys

import pandas as pd

from .config import AI_OUTPUT_DIR, AISettings


def _load_csv(name: str) -> pd.DataFrame:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return pd.read_csv(path)


def _load_json(name: str) -> dict:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def run() -> int:
    settings = AISettings()

    try:
        dataset_metadata = _load_json("dataset_metadata.json")
        comparison = _load_json("model_comparison.json")
        forecast_metadata = _load_json("future_forecast_metadata.json")

        inventory = _load_csv("dataset_inventario_ai.csv")
        sales = _load_csv("future_sales_forecast.csv")
        demand = _load_csv("future_demand_forecast.csv")

        reference_date = pd.Timestamp(
            dataset_metadata["reference_date"]
        ).normalize()

        sales["periodo"] = pd.to_datetime(sales["periodo"])
        demand["fecha"] = pd.to_datetime(demand["fecha"])

        product_count = int(
            inventory[
                ["empresa_key", "producto_key"]
            ].drop_duplicates().shape[0]
        )

        expected_sales_rows = (
            product_count * settings.sales_horizon_months
        )
        expected_demand_rows = (
            product_count * settings.demand_horizon_days
        )

        _assert(
            str(forecast_metadata["sales"]["champion"]).lower()
            == str(comparison["sales"]["champion"]).lower(),
            "El campeón de ventas del forecast no coincide con la evaluación.",
        )

        _assert(
            str(forecast_metadata["demand"]["champion"]).lower()
            == str(comparison["demand"]["champion"]).lower(),
            "El campeón de demanda del forecast no coincide con la evaluación.",
        )

        _assert(
            len(sales) == expected_sales_rows,
            (
                "Cantidad inesperada de pronósticos de ventas: "
                f"{len(sales)} != {expected_sales_rows}"
            ),
        )

        _assert(
            len(demand) == expected_demand_rows,
            (
                "Cantidad inesperada de pronósticos de demanda: "
                f"{len(demand)} != {expected_demand_rows}"
            ),
        )

        _assert(
            not sales.duplicated(
                ["empresa_key", "producto_key", "periodo"]
            ).any(),
            "Existen duplicados en los pronósticos de ventas.",
        )

        _assert(
            not demand.duplicated(
                ["empresa_key", "producto_key", "fecha"]
            ).any(),
            "Existen duplicados en los pronósticos de demanda.",
        )

        _assert(
            bool((sales["periodo"] > reference_date).all()),
            "Ventas contiene periodos no futuros.",
        )

        _assert(
            bool((demand["fecha"] > reference_date).all()),
            "Demanda contiene fechas no futuras.",
        )

        _assert(
            bool((sales["venta_neta_pronosticada"] >= 0).all()),
            "Ventas contiene valores negativos.",
        )

        _assert(
            bool((demand["unidades_pronosticadas"] >= 0).all()),
            "Demanda contiene valores negativos.",
        )

        sales_horizons = (
            sales.groupby(
                ["empresa_key", "producto_key"]
            )["horizonte_meses"]
            .nunique()
        )

        demand_horizons = (
            demand.groupby(
                ["empresa_key", "producto_key"]
            )["horizonte_dias"]
            .nunique()
        )

        _assert(
            bool(
                (
                    sales_horizons
                    == settings.sales_horizon_months
                ).all()
            ),
            "No todos los productos tienen el horizonte completo de ventas.",
        )

        _assert(
            bool(
                (
                    demand_horizons
                    == settings.demand_horizon_days
                ).all()
            ),
            "No todos los productos tienen el horizonte completo de demanda.",
        )

        _assert(
            forecast_metadata["persistence"]["postgresql_written"] is False,
            (
                "Este bloque no debe escribir todavía en PostgreSQL. "
                "La persistencia corresponde al siguiente checkpoint."
            ),
        )

        print()
        print("=== ComercioBI - Verificación Fase 14 / Pronósticos ===")
        print(f"Productos: {product_count}")
        print(
            "Ventas: "
            f"{len(sales)} filas | "
            f"{sales['periodo'].min().date().isoformat()} -> "
            f"{sales['periodo'].max().date().isoformat()}"
        )
        print(
            "Demanda: "
            f"{len(demand)} filas | "
            f"{demand['fecha'].min().date().isoformat()} -> "
            f"{demand['fecha'].max().date().isoformat()}"
        )
        print(
            "Campeón ventas: "
            f"{forecast_metadata['sales']['champion'].upper()}"
        )
        print(
            "Campeón demanda: "
            f"{forecast_metadata['demand']['champion'].upper()}"
        )
        print("Duplicados: 0")
        print("Valores negativos: 0")
        print("Persistencia PostgreSQL: False")
        print()
        print("Verificación de pronósticos completada correctamente.")
        return 0

    except (RuntimeError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            f"ERROR inesperado durante la validación: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
