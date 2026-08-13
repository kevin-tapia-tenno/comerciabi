from __future__ import annotations

import json
import sys

import pandas as pd

from .config import AI_OUTPUT_DIR, ensure_ai_directories
from .uncertainty import IntervalCalibration, add_prediction_interval


SALES_FILE = "future_sales_forecast.csv"
DEMAND_FILE = "future_demand_forecast.csv"
METADATA_FILE = "future_forecast_metadata.json"
CALIBRATION_FILE = "interval_calibration.json"


SALES_REQUIRED_COLUMNS = {
    "empresa_key",
    "empresa",
    "producto_key",
    "sku",
    "producto",
    "categoria",
    "periodo_origen",
    "periodo",
    "horizonte_meses",
    "venta_neta_pronosticada",
    "modelo",
    "origen_datos",
    "model_version",
}

DEMAND_REQUIRED_COLUMNS = {
    "empresa_key",
    "empresa",
    "producto_key",
    "sku",
    "producto",
    "categoria",
    "fecha_origen",
    "fecha",
    "horizonte_dias",
    "unidades_pronosticadas",
    "modelo",
    "origen_datos",
    "model_version",
}


def _load_json(name: str) -> dict:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _load_csv(name: str) -> pd.DataFrame:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return pd.read_csv(path)


def _require_columns(
    dataframe: pd.DataFrame,
    required: set[str],
    label: str,
) -> None:
    missing = sorted(required.difference(dataframe.columns))
    if missing:
        raise ValueError(
            f"Faltan columnas en {label}: {', '.join(missing)}"
        )


def _calibration_from_dict(data: dict) -> IntervalCalibration:
    required = {
        "method",
        "nominal_coverage",
        "calibration_rows",
        "quantile_level",
        "absolute_error_quantile",
        "empirical_coverage",
        "mean_absolute_error",
        "median_absolute_error",
    }
    missing = sorted(required.difference(data))
    if missing:
        raise ValueError(
            "La calibracion no contiene todos los campos requeridos: "
            + ", ".join(missing)
        )

    return IntervalCalibration(
        method=str(data["method"]),
        nominal_coverage=float(data["nominal_coverage"]),
        calibration_rows=int(data["calibration_rows"]),
        quantile_level=float(data["quantile_level"]),
        absolute_error_quantile=float(data["absolute_error_quantile"]),
        empirical_coverage=float(data["empirical_coverage"]),
        mean_absolute_error=float(data["mean_absolute_error"]),
        median_absolute_error=float(data["median_absolute_error"]),
    )


def _validate_origin(
    forecast: pd.DataFrame,
    *,
    expected_origin: str,
    label: str,
) -> None:
    origins = {
        str(value).strip().upper()
        for value in forecast["origen_datos"].dropna().unique()
    }
    if origins != {expected_origin.upper()}:
        raise ValueError(
            f"Origen inconsistente en {label}. "
            f"Esperado={expected_origin}; encontrado={sorted(origins)}"
        )


def _validate_model_version(
    forecast: pd.DataFrame,
    *,
    expected_version: str,
    label: str,
) -> None:
    versions = {
        str(value).strip()
        for value in forecast["model_version"].dropna().unique()
    }
    if versions != {expected_version}:
        raise ValueError(
            f"Version de modelo inconsistente en {label}. "
            f"Esperado={expected_version}; encontrado={sorted(versions)}"
        )


def _validate_champion_model(
    forecast: pd.DataFrame,
    *,
    champion: str,
    label: str,
) -> None:
    models = {
        str(value).strip().lower()
        for value in forecast["modelo"].dropna().unique()
    }
    if not models:
        raise ValueError(f"No existe modelo informado en {label}.")

    champion = champion.strip().lower()

    if champion == "xgboost":
        if not all("xgboost" in model for model in models):
            raise ValueError(
                f"El champion de {label} es XGBoost, "
                f"pero se encontraron modelos: {sorted(models)}"
            )
        return

    if champion == "baseline":
        if any("xgboost" in model for model in models):
            raise ValueError(
                f"El champion de {label} es baseline, "
                f"pero se encontraron modelos XGBoost: {sorted(models)}"
            )
        return

    raise ValueError(f"Champion no soportado para {label}: {champion}")


def _validate_interval(
    frame: pd.DataFrame,
    *,
    prediction_column: str,
    label: str,
) -> None:
    _require_columns(
        frame,
        {prediction_column, "limite_inferior", "limite_superior"},
        label,
    )

    values = frame[
        [prediction_column, "limite_inferior", "limite_superior"]
    ].apply(pd.to_numeric, errors="coerce")

    if values.isna().any().any():
        raise ValueError(
            f"Existen valores nulos o no numericos en los intervalos de {label}."
        )

    if (values < 0).any().any():
        raise ValueError(
            f"Existen valores negativos en los intervalos de {label}."
        )

    invalid = (
        values["limite_inferior"] > values[prediction_column]
    ) | (
        values[prediction_column] > values["limite_superior"]
    )

    if invalid.any():
        raise ValueError(f"Existen intervalos inconsistentes en {label}.")


def _reorder_sales(frame: pd.DataFrame) -> pd.DataFrame:
    preferred = [
        "empresa_key",
        "empresa",
        "producto_key",
        "sku",
        "producto",
        "categoria",
        "periodo_origen",
        "periodo",
        "horizonte_meses",
        "venta_neta_pronosticada",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
        "model_version",
    ]
    extra = [column for column in frame.columns if column not in preferred]
    return frame[preferred + extra]


def _reorder_demand(frame: pd.DataFrame) -> pd.DataFrame:
    preferred = [
        "empresa_key",
        "empresa",
        "producto_key",
        "sku",
        "producto",
        "categoria",
        "fecha_origen",
        "fecha",
        "horizonte_dias",
        "unidades_pronosticadas",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
        "model_version",
    ]
    extra = [column for column in frame.columns if column not in preferred]
    return frame[preferred + extra]


def run() -> int:
    ensure_ai_directories()

    try:
        calibration_metadata = _load_json(CALIBRATION_FILE)
        forecast_metadata = _load_json(METADATA_FILE)
        sales = _load_csv(SALES_FILE)
        demand = _load_csv(DEMAND_FILE)

        _require_columns(sales, SALES_REQUIRED_COLUMNS, SALES_FILE)
        _require_columns(demand, DEMAND_REQUIRED_COLUMNS, DEMAND_FILE)

        origin = str(calibration_metadata["origin"]).strip().upper()
        model_version = str(calibration_metadata["model_version"]).strip()

        sales_champion = str(
            calibration_metadata["sales"]["champion"]
        ).strip().lower()
        demand_champion = str(
            calibration_metadata["demand"]["champion"]
        ).strip().lower()

        _validate_origin(sales, expected_origin=origin, label="ventas")
        _validate_origin(demand, expected_origin=origin, label="demanda")
        _validate_model_version(
            sales,
            expected_version=model_version,
            label="ventas",
        )
        _validate_model_version(
            demand,
            expected_version=model_version,
            label="demanda",
        )
        _validate_champion_model(
            sales,
            champion=sales_champion,
            label="ventas",
        )
        _validate_champion_model(
            demand,
            champion=demand_champion,
            label="demanda",
        )

        sales_calibration = _calibration_from_dict(
            calibration_metadata["sales"]
        )
        demand_calibration = _calibration_from_dict(
            calibration_metadata["demand"]
        )

        sales_final = add_prediction_interval(
            sales,
            prediction_column="venta_neta_pronosticada",
            lower_column="limite_inferior",
            upper_column="limite_superior",
            calibration=sales_calibration,
            minimum_value=0.0,
        )
        demand_final = add_prediction_interval(
            demand,
            prediction_column="unidades_pronosticadas",
            lower_column="limite_inferior",
            upper_column="limite_superior",
            calibration=demand_calibration,
            minimum_value=0.0,
        )

        _validate_interval(
            sales_final,
            prediction_column="venta_neta_pronosticada",
            label="ventas",
        )
        _validate_interval(
            demand_final,
            prediction_column="unidades_pronosticadas",
            label="demanda",
        )

        sales_final = _reorder_sales(sales_final)
        demand_final = _reorder_demand(demand_final)

        sales_path = AI_OUTPUT_DIR / SALES_FILE
        demand_path = AI_OUTPUT_DIR / DEMAND_FILE
        metadata_path = AI_OUTPUT_DIR / METADATA_FILE

        sales_final.to_csv(sales_path, index=False, encoding="utf-8-sig")
        demand_final.to_csv(demand_path, index=False, encoding="utf-8-sig")

        source_artifacts = forecast_metadata.get("source_artifacts")
        if not isinstance(source_artifacts, dict):
            source_artifacts = {}
        source_artifacts["interval_calibration"] = CALIBRATION_FILE
        forecast_metadata["source_artifacts"] = source_artifacts

        forecast_metadata["uncertainty"] = {
            "applied": True,
            "source": CALIBRATION_FILE,
            "method": str(calibration_metadata["policy"]["method"]),
            "nominal_coverage": float(
                calibration_metadata["policy"]["nominal_coverage"]
            ),
            "formal_coverage_guarantee": bool(
                calibration_metadata["policy"]["formal_coverage_guarantee"]
            ),
            "lower_bound_floor": float(
                calibration_metadata["policy"]["lower_bound_floor"]
            ),
            "sales": {
                "champion": sales_champion,
                "calibration_rows": sales_calibration.calibration_rows,
                "absolute_error_quantile": (
                    sales_calibration.absolute_error_quantile
                ),
                "empirical_coverage": sales_calibration.empirical_coverage,
                "forecast_rows": int(len(sales_final)),
            },
            "demand": {
                "champion": demand_champion,
                "calibration_rows": demand_calibration.calibration_rows,
                "absolute_error_quantile": (
                    demand_calibration.absolute_error_quantile
                ),
                "empirical_coverage": demand_calibration.empirical_coverage,
                "forecast_rows": int(len(demand_final)),
            },
        }

        persistence = forecast_metadata.get("persistence")
        if not isinstance(persistence, dict):
            persistence = {}
        persistence["postgresql_written"] = False
        persistence.setdefault(
            "reason",
            "La persistencia se realizara despues de validar pronosticos e intervalos.",
        )
        forecast_metadata["persistence"] = persistence

        metadata_path.write_text(
            json.dumps(forecast_metadata, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print()
        print(
            "=== ComercioBI - Fase 14 / "
            "Aplicacion de intervalos a pronosticos futuros ==="
        )
        print(f"Origen: {origin}")
        print(f"Version modelo: {model_version}")
        print()
        print("--- Ventas ---")
        print(f"Champion: {sales_champion.upper()}")
        print(f"Filas: {len(sales_final)}")
        print(
            "Amplitud calibrada: "
            f"{sales_calibration.absolute_error_quantile:.4f}"
        )
        print()
        print("--- Demanda ---")
        print(f"Champion: {demand_champion.upper()}")
        print(f"Filas: {len(demand_final)}")
        print(
            "Amplitud calibrada: "
            f"{demand_calibration.absolute_error_quantile:.4f}"
        )
        print()
        print("Artefactos finalizados:")
        print(f"- {sales_path}")
        print(f"- {demand_path}")
        print(f"- {metadata_path}")
        print()
        print(
            "Intervalos aplicados correctamente. "
            "Persistencia PostgreSQL: False"
        )
        return 0

    except (KeyError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            "ERROR inesperado al finalizar pronosticos: "
            f"{exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
