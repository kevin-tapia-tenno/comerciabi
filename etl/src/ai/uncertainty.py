from __future__ import annotations

from dataclasses import dataclass
from math import ceil

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class IntervalCalibration:
    """
    Resultado de la calibración de una banda de incertidumbre.

    La banda utiliza el cuantil empírico de los errores absolutos
    observados en un conjunto temporal de calibración.

    No se presenta como un intervalo probabilístico paramétrico.
    Es una banda operacional basada en desempeño fuera de muestra.
    """

    method: str
    nominal_coverage: float
    calibration_rows: int
    quantile_level: float
    absolute_error_quantile: float
    empirical_coverage: float
    mean_absolute_error: float
    median_absolute_error: float

    def to_dict(self) -> dict[str, float | int | str]:
        return {
            "method": self.method,
            "nominal_coverage": round(self.nominal_coverage, 4),
            "calibration_rows": self.calibration_rows,
            "quantile_level": round(self.quantile_level, 6),
            "absolute_error_quantile": round(
                self.absolute_error_quantile,
                6,
            ),
            "empirical_coverage": round(
                self.empirical_coverage,
                4,
            ),
            "mean_absolute_error": round(
                self.mean_absolute_error,
                6,
            ),
            "median_absolute_error": round(
                self.median_absolute_error,
                6,
            ),
        }


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


def _validate_coverage(coverage: float) -> None:
    if not 0.0 < coverage < 1.0:
        raise ValueError(
            "La cobertura del intervalo debe estar entre 0 y 1."
        )


def _finite_sample_quantile_level(
    *,
    n: int,
    coverage: float,
) -> float:
    """
    Nivel de cuantil con corrección finita conservadora.

    Para n residuos y cobertura objetivo, se utiliza:

        ceil((n + 1) * coverage) / n

    limitado a 1.0.
    """

    if n <= 0:
        raise ValueError(
            "Se necesita al menos una observación para calcular el cuantil."
        )

    return min(
        1.0,
        ceil((n + 1) * coverage) / n,
    )


def calibrate_absolute_error_interval(
    predictions: pd.DataFrame,
    *,
    actual_column: str,
    predicted_column: str,
    coverage: float = 0.90,
    minimum_rows: int = 20,
) -> IntervalCalibration:
    """
    Calibra una banda simétrica utilizando errores absolutos de holdout.

    La amplitud obtenida se puede aplicar después a los pronósticos
    futuros del mismo problema/modelo champion.
    """

    _validate_coverage(coverage)

    if minimum_rows <= 0:
        raise ValueError(
            "minimum_rows debe ser mayor que cero."
        )

    _require_columns(
        predictions,
        {actual_column, predicted_column},
        "predictions",
    )

    data = predictions[
        [actual_column, predicted_column]
    ].copy()

    data[actual_column] = pd.to_numeric(
        data[actual_column],
        errors="coerce",
    )

    data[predicted_column] = pd.to_numeric(
        data[predicted_column],
        errors="coerce",
    )

    data = data.dropna(
        subset=[actual_column, predicted_column]
    ).reset_index(drop=True)

    if len(data) < minimum_rows:
        raise RuntimeError(
            "No existen suficientes observaciones de calibración. "
            f"Disponibles: {len(data)}; mínimo requerido: "
            f"{minimum_rows}."
        )

    actual = data[actual_column].to_numpy(dtype=float)
    predicted = data[predicted_column].to_numpy(dtype=float)

    if not np.isfinite(actual).all():
        raise ValueError(
            "La columna real contiene valores no finitos."
        )

    if not np.isfinite(predicted).all():
        raise ValueError(
            "La columna pronosticada contiene valores no finitos."
        )

    absolute_error = np.abs(predicted - actual)

    quantile_level = _finite_sample_quantile_level(
        n=len(absolute_error),
        coverage=coverage,
    )

    absolute_error_quantile = float(
        np.quantile(
            absolute_error,
            quantile_level,
            method="higher",
        )
    )

    lower = np.maximum(
        predicted - absolute_error_quantile,
        0.0,
    )

    upper = predicted + absolute_error_quantile

    empirical_coverage = float(
        np.mean(
            (actual >= lower)
            & (actual <= upper)
        )
    )

    return IntervalCalibration(
        method="holdout_absolute_error_quantile",
        nominal_coverage=float(coverage),
        calibration_rows=int(len(data)),
        quantile_level=float(quantile_level),
        absolute_error_quantile=absolute_error_quantile,
        empirical_coverage=empirical_coverage,
        mean_absolute_error=float(
            np.mean(absolute_error)
        ),
        median_absolute_error=float(
            np.median(absolute_error)
        ),
    )


def add_prediction_interval(
    forecasts: pd.DataFrame,
    *,
    prediction_column: str,
    lower_column: str,
    upper_column: str,
    calibration: IntervalCalibration,
    minimum_value: float = 0.0,
) -> pd.DataFrame:
    """
    Añade límites inferior y superior a pronósticos puntuales.

    Para targets no negativos de ComercioBI, minimum_value debe
    permanecer en 0.
    """

    _require_columns(
        forecasts,
        {prediction_column},
        "forecasts",
    )

    result = forecasts.copy()

    prediction = pd.to_numeric(
        result[prediction_column],
        errors="coerce",
    )

    if prediction.isna().any():
        raise ValueError(
            f"La columna {prediction_column} contiene "
            "valores nulos o no numéricos."
        )

    values = prediction.to_numpy(dtype=float)

    if not np.isfinite(values).all():
        raise ValueError(
            f"La columna {prediction_column} contiene "
            "valores no finitos."
        )

    width = float(
        calibration.absolute_error_quantile
    )

    result[lower_column] = np.maximum(
        values - width,
        minimum_value,
    )

    result[upper_column] = np.maximum(
        values + width,
        result[lower_column].to_numpy(dtype=float),
    )

    result[lower_column] = result[
        lower_column
    ].round(4)

    result[prediction_column] = result[
        prediction_column
    ].astype(float).round(4)

    result[upper_column] = result[
        upper_column
    ].round(4)

    invalid = (
        result[lower_column]
        > result[prediction_column]
    ) | (
        result[prediction_column]
        > result[upper_column]
    )

    if invalid.any():
        raise RuntimeError(
            "Se generaron intervalos inconsistentes: "
            "debe cumplirse límite inferior <= pronóstico "
            "<= límite superior."
        )

    return result