from __future__ import annotations

import pandas as pd

from .features import TemporalCutoffs
from .metrics import regression_metrics


def sales_seasonal_naive_baseline(
    monthly_panel: pd.DataFrame,
    cutoffs: TemporalCutoffs,
) -> pd.DataFrame:
    train = monthly_panel[
        monthly_panel["periodo"] < cutoffs.sales_holdout_start
    ].copy()

    holdout = monthly_panel[
        monthly_panel["periodo"] >= cutoffs.sales_holdout_start
    ].copy()

    predictions = []

    for keys, product_holdout in holdout.groupby(
        ["empresa_key", "producto_key"]
    ):
        product_train = train[
            (train["empresa_key"] == keys[0])
            & (train["producto_key"] == keys[1])
        ].sort_values("periodo")

        if product_train.empty:
            fallback_value = 0.0
            historical_map = {}
        else:
            fallback_value = float(product_train["venta_neta"].iloc[-1])
            historical_map = {
                pd.Timestamp(row.periodo): float(row.venta_neta)
                for row in product_train.itertuples()
            }

        for row in product_holdout.sort_values("periodo").itertuples():
            previous_year_period = (
                pd.Timestamp(row.periodo) - pd.DateOffset(years=1)
            )

            predicted = historical_map.get(
                previous_year_period,
                fallback_value,
            )

            predictions.append(
                {
                    "empresa_key": row.empresa_key,
                    "empresa": row.empresa,
                    "producto_key": row.producto_key,
                    "sku": row.sku,
                    "producto": row.producto,
                    "categoria": row.categoria,
                    "periodo": row.periodo,
                    "venta_neta_real": float(row.venta_neta),
                    "venta_neta_predicha": max(float(predicted), 0.0),
                    "metodo_baseline": (
                        "seasonal_naive_12m"
                        if previous_year_period in historical_map
                        else "last_train_value"
                    ),
                    "origen_datos": row.origen_datos,
                }
            )

    return pd.DataFrame(predictions).sort_values(
        ["empresa_key", "producto_key", "periodo"]
    ).reset_index(drop=True)


def demand_weekly_naive_baseline(
    daily_panel: pd.DataFrame,
    cutoffs: TemporalCutoffs,
) -> pd.DataFrame:
    train = daily_panel[
        daily_panel["fecha"] < cutoffs.demand_holdout_start
    ].copy()

    holdout = daily_panel[
        daily_panel["fecha"] >= cutoffs.demand_holdout_start
    ].copy()

    predictions = []

    for keys, product_holdout in holdout.groupby(
        ["empresa_key", "producto_key"]
    ):
        product_train = train[
            (train["empresa_key"] == keys[0])
            & (train["producto_key"] == keys[1])
        ].sort_values("fecha")

        recent = product_train["unidades"].tail(7).astype(float).tolist()

        if not recent:
            recent = [0.0]

        while len(recent) < 7:
            recent = recent + recent

        weekly_pattern = recent[-7:]

        ordered_holdout = product_holdout.sort_values(
            "fecha"
        ).reset_index(drop=True)

        for offset, row in ordered_holdout.iterrows():
            predicted = weekly_pattern[offset % 7]

            predictions.append(
                {
                    "empresa_key": row["empresa_key"],
                    "empresa": row["empresa"],
                    "producto_key": row["producto_key"],
                    "sku": row["sku"],
                    "producto": row["producto"],
                    "categoria": row["categoria"],
                    "fecha": row["fecha"],
                    "unidades_reales": float(row["unidades"]),
                    "unidades_predichas": max(float(predicted), 0.0),
                    "metodo_baseline": "weekly_naive_repeat_7d",
                    "origen_datos": row["origen_datos"],
                }
            )

    return pd.DataFrame(predictions).sort_values(
        ["empresa_key", "producto_key", "fecha"]
    ).reset_index(drop=True)


def evaluate_sales_baseline(predictions: pd.DataFrame):
    return regression_metrics(
        predictions["venta_neta_real"],
        predictions["venta_neta_predicha"],
    )


def evaluate_demand_baseline(predictions: pd.DataFrame):
    return regression_metrics(
        predictions["unidades_reales"],
        predictions["unidades_predichas"],
    )
