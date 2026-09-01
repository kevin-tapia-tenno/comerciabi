from __future__ import annotations

import json
import sys

import pandas as pd

from .config import (
    AI_OUTPUT_DIR,
    AISettings,
    ensure_ai_directories,
)
from .uncertainty import calibrate_absolute_error_interval


def _load_json(name: str) -> dict:
    path = AI_OUTPUT_DIR / name

    if not path.exists():
        raise RuntimeError(
            f"No existe el archivo requerido: {path}"
        )

    return json.loads(
        path.read_text(encoding="utf-8")
    )


def _load_csv(name: str) -> pd.DataFrame:
    path = AI_OUTPUT_DIR / name

    if not path.exists():
        raise RuntimeError(
            f"No existe el archivo requerido: {path}"
        )

    return pd.read_csv(path)


def _champion_file(
    problem: str,
    champion: str,
) -> tuple[str, str, str]:
    champion_normalized = champion.lower().strip()

    if problem == "sales":
        if champion_normalized == "baseline":
            return (
                "baseline_sales_predictions.csv",
                "venta_neta_real",
                "venta_neta_predicha",
            )

        if champion_normalized == "xgboost":
            return (
                "xgboost_sales_predictions.csv",
                "venta_neta_real",
                "venta_neta_predicha",
            )

    if problem == "demand":
        if champion_normalized == "baseline":
            return (
                "baseline_demand_predictions.csv",
                "unidades_reales",
                "unidades_predichas",
            )

        if champion_normalized == "xgboost":
            return (
                "xgboost_demand_predictions.csv",
                "unidades_reales",
                "unidades_predichas",
            )

    raise ValueError(
        f"Champion no soportado para {problem}: "
        f"{champion}"
    )


def run() -> int:
    settings = AISettings()
    ensure_ai_directories()

    try:
        comparison = _load_json(
            "model_comparison.json"
        )

        origin = str(
            comparison.get("origin", "")
        ).strip()

        sales_champion = str(
            comparison["sales"]["champion"]
        ).lower()

        demand_champion = str(
            comparison["demand"]["champion"]
        ).lower()

        (
            sales_file,
            sales_actual,
            sales_predicted,
        ) = _champion_file(
            "sales",
            sales_champion,
        )

        (
            demand_file,
            demand_actual,
            demand_predicted,
        ) = _champion_file(
            "demand",
            demand_champion,
        )

        sales_predictions = _load_csv(
            sales_file
        )

        demand_predictions = _load_csv(
            demand_file
        )

        sales_calibration = (
            calibrate_absolute_error_interval(
                sales_predictions,
                actual_column=sales_actual,
                predicted_column=sales_predicted,
                coverage=settings.prediction_interval_coverage,
                minimum_rows=(
                    settings.prediction_interval_min_calibration_rows
                ),
            )
        )

        demand_calibration = (
            calibrate_absolute_error_interval(
                demand_predictions,
                actual_column=demand_actual,
                predicted_column=demand_predicted,
                coverage=settings.prediction_interval_coverage,
                minimum_rows=(
                    settings.prediction_interval_min_calibration_rows
                ),
            )
        )

        metadata = {
            "origin": origin,
            "model_version": settings.model_version,
            "policy": {
                "method": (
                    "holdout_absolute_error_quantile"
                ),
                "nominal_coverage": (
                    settings.prediction_interval_coverage
                ),
                "minimum_calibration_rows": (
                    settings.prediction_interval_min_calibration_rows
                ),
                "lower_bound_floor": 0.0,
                "formal_coverage_guarantee": False,
                "note": (
                    "La misma ventana holdout participa en "
                    "la selección del champion. Por ello, "
                    "estas bandas se interpretan como "
                    "incertidumbre operacional basada en "
                    "desempeño fuera de muestra, no como "
                    "garantía estadística formal de cobertura."
                ),
            },
            "sales": {
                "champion": sales_champion,
                "calibration_source": sales_file,
                **sales_calibration.to_dict(),
            },
            "demand": {
                "champion": demand_champion,
                "calibration_source": demand_file,
                **demand_calibration.to_dict(),
            },
        }

        output_path = (
            AI_OUTPUT_DIR
            / "interval_calibration.json"
        )

        output_path.write_text(
            json.dumps(
                metadata,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        print()
        print(
            "=== ComercioBI - Fase 14 / "
            "Calibración de incertidumbre ==="
        )
        print(
            f"Origen de datos: {origin}"
        )
        print(
            "Cobertura nominal: "
            f"{settings.prediction_interval_coverage:.0%}"
        )

        print()
        print("--- Ventas ---")
        print(
            f"Champion: {sales_champion.upper()}"
        )
        print(
            "Filas calibración: "
            f"{sales_calibration.calibration_rows}"
        )
        print(
            "Error absoluto de calibración: "
            f"{sales_calibration.absolute_error_quantile:.4f}"
        )
        print(
            "Cobertura empírica holdout: "
            f"{sales_calibration.empirical_coverage:.2%}"
        )

        print()
        print("--- Demanda ---")
        print(
            f"Champion: {demand_champion.upper()}"
        )
        print(
            "Filas calibración: "
            f"{demand_calibration.calibration_rows}"
        )
        print(
            "Error absoluto de calibración: "
            f"{demand_calibration.absolute_error_quantile:.4f}"
        )
        print(
            "Cobertura empírica holdout: "
            f"{demand_calibration.empirical_coverage:.2%}"
        )

        print()
        print(
            "Artefacto generado:"
        )
        print(
            f"- {output_path}"
        )
        print()
        print(
            "Calibración de incertidumbre "
            "completada correctamente."
        )

        return 0

    except (
        KeyError,
        RuntimeError,
        ValueError,
    ) as exc:
        print(
            f"ERROR: {exc}",
            file=sys.stderr,
        )
        return 1

    except Exception as exc:
        print(
            "ERROR inesperado durante la "
            "calibración de incertidumbre: "
            f"{exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(run())