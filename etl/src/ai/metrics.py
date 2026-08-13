from __future__ import annotations

import math
import numpy as np
import pandas as pd


def regression_metrics(actual, predicted) -> dict[str, float | None]:
    y_true = np.asarray(actual, dtype=float)
    y_pred = np.asarray(predicted, dtype=float)

    if y_true.shape != y_pred.shape:
        raise ValueError("actual y predicted deben tener la misma dimensión.")

    if y_true.size == 0:
        raise ValueError("No se pueden calcular métricas sobre cero observaciones.")

    error = y_pred - y_true
    absolute_error = np.abs(error)

    mae = float(np.mean(absolute_error))
    rmse = float(math.sqrt(np.mean(np.square(error))))

    absolute_total = float(np.sum(np.abs(y_true)))
    actual_total = float(np.sum(y_true))
    predicted_total = float(np.sum(y_pred))

    wape_pct = (
        float(np.sum(absolute_error) / absolute_total * 100.0)
        if absolute_total > 0
        else None
    )

    bias_pct = (
        float((predicted_total - actual_total) / actual_total * 100.0)
        if actual_total != 0
        else None
    )

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "wape_pct": round(wape_pct, 4) if wape_pct is not None else None,
        "bias_pct": round(bias_pct, 4) if bias_pct is not None else None,
        "actual_total": round(actual_total, 4),
        "predicted_total": round(predicted_total, 4),
    }


def metrics_by_product(
    predictions: pd.DataFrame,
    *,
    actual_column: str,
    predicted_column: str,
) -> pd.DataFrame:
    rows = []

    grouped = predictions.groupby(
        ["empresa_key", "empresa", "producto_key", "sku", "producto"],
        dropna=False,
    )

    for keys, group in grouped:
        values = regression_metrics(
            group[actual_column],
            group[predicted_column],
        )

        rows.append(
            {
                "empresa_key": keys[0],
                "empresa": keys[1],
                "producto_key": keys[2],
                "sku": keys[3],
                "producto": keys[4],
                **values,
            }
        )

    return pd.DataFrame(rows).sort_values(
        ["empresa_key", "producto_key"]
    ).reset_index(drop=True)
