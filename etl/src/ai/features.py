from __future__ import annotations

from dataclasses import dataclass
import numpy as np
import pandas as pd

from .config import AISettings


@dataclass(frozen=True)
class TemporalCutoffs:
    sales_holdout_start: pd.Timestamp
    sales_holdout_end: pd.Timestamp
    demand_holdout_start: pd.Timestamp
    demand_holdout_end: pd.Timestamp


def _require_columns(dataframe: pd.DataFrame, required: set[str], name: str) -> None:
    missing = sorted(required.difference(dataframe.columns))
    if missing:
        raise ValueError(f"Faltan columnas en {name}: {', '.join(missing)}")


def _product_master(
    sales_history: pd.DataFrame,
    inventory: pd.DataFrame,
) -> pd.DataFrame:
    columns = [
        "empresa_key",
        "empresa",
        "producto_key",
        "sku",
        "producto",
        "categoria",
    ]

    parts = []

    if not inventory.empty:
        inv = inventory[columns].copy()
        inv["_priority"] = 0
        parts.append(inv)

    if not sales_history.empty:
        sales = sales_history[columns].copy()
        sales["_priority"] = 1
        parts.append(sales)

    if not parts:
        raise RuntimeError("No hay productos disponibles para construir features.")

    master = pd.concat(parts, ignore_index=True)

    return (
        master.sort_values("_priority")
        .drop_duplicates(
            subset=["empresa_key", "producto_key"],
            keep="first",
        )
        .drop(columns="_priority")
        .sort_values(["empresa_key", "producto_key"])
        .reset_index(drop=True)
    )


def build_monthly_sales_panel(
    sales_history: pd.DataFrame,
    inventory: pd.DataFrame,
) -> pd.DataFrame:
    _require_columns(
        sales_history,
        {
            "empresa_key",
            "empresa",
            "fecha",
            "producto_key",
            "sku",
            "producto",
            "categoria",
            "unidades",
            "venta_neta",
            "utilidad_bruta",
            "origen_datos",
        },
        "sales_history",
    )

    sales = sales_history.copy()
    sales["fecha"] = pd.to_datetime(sales["fecha"])
    sales["periodo"] = sales["fecha"].dt.to_period("M").dt.to_timestamp()

    aggregated = (
        sales.groupby(
            ["empresa_key", "producto_key", "periodo"],
            as_index=False,
        )
        .agg(
            unidades=("unidades", "sum"),
            venta_neta=("venta_neta", "sum"),
            utilidad_bruta=("utilidad_bruta", "sum"),
        )
    )

    master = _product_master(sales, inventory)

    periods = pd.DataFrame(
        {
            "periodo": pd.date_range(
                sales["periodo"].min(),
                sales["periodo"].max(),
                freq="MS",
            )
        }
    )

    panel = master.merge(periods, how="cross")
    panel = panel.merge(
        aggregated,
        on=["empresa_key", "producto_key", "periodo"],
        how="left",
    )

    for column in ["unidades", "venta_neta", "utilidad_bruta"]:
        panel[column] = panel[column].fillna(0.0).astype(float)

    panel["origen_datos"] = str(sales["origen_datos"].iloc[0])

    panel["margen_bruto_pct"] = np.where(
        panel["venta_neta"] > 0,
        panel["utilidad_bruta"] / panel["venta_neta"] * 100.0,
        0.0,
    )

    return panel.sort_values(
        ["empresa_key", "producto_key", "periodo"]
    ).reset_index(drop=True)


def build_daily_demand_panel(
    sales_history: pd.DataFrame,
    inventory: pd.DataFrame,
) -> pd.DataFrame:
    sales = sales_history.copy()
    sales["fecha"] = pd.to_datetime(sales["fecha"]).dt.normalize()

    aggregated = (
        sales.groupby(
            ["empresa_key", "producto_key", "fecha"],
            as_index=False,
        )
        .agg(
            unidades=("unidades", "sum"),
            venta_neta=("venta_neta", "sum"),
            utilidad_bruta=("utilidad_bruta", "sum"),
        )
    )

    master = _product_master(sales, inventory)

    dates = pd.DataFrame(
        {
            "fecha": pd.date_range(
                sales["fecha"].min(),
                sales["fecha"].max(),
                freq="D",
            )
        }
    )

    panel = master.merge(dates, how="cross")
    panel = panel.merge(
        aggregated,
        on=["empresa_key", "producto_key", "fecha"],
        how="left",
    )

    for column in ["unidades", "venta_neta", "utilidad_bruta"]:
        panel[column] = panel[column].fillna(0.0).astype(float)

    panel["origen_datos"] = str(sales["origen_datos"].iloc[0])

    return panel.sort_values(
        ["empresa_key", "producto_key", "fecha"]
    ).reset_index(drop=True)


def add_monthly_sales_features(panel: pd.DataFrame) -> pd.DataFrame:
    data = panel.sort_values(
        ["empresa_key", "producto_key", "periodo"]
    ).reset_index(drop=True).copy()

    data["mes"] = data["periodo"].dt.month.astype(int)
    data["trimestre"] = data["periodo"].dt.quarter.astype(int)
    data["anio"] = data["periodo"].dt.year.astype(int)
    data["mes_sin"] = np.sin(2.0 * np.pi * data["mes"] / 12.0)
    data["mes_cos"] = np.cos(2.0 * np.pi * data["mes"] / 12.0)

    min_period = data["periodo"].min()
    data["tendencia_mes"] = (
        (data["periodo"].dt.year - min_period.year) * 12
        + data["periodo"].dt.month
        - min_period.month
    ).astype(int)

    keys = ["empresa_key", "producto_key"]
    grouped = data.groupby(keys, group_keys=False)

    for lag in [1, 2, 3, 6, 12]:
        data[f"venta_neta_lag_{lag}"] = grouped["venta_neta"].shift(lag)

    for lag in [1, 3, 6, 12]:
        data[f"unidades_lag_{lag}"] = grouped["unidades"].shift(lag)

    shifted_sales = grouped["venta_neta"].shift(1)
    shifted_units = grouped["unidades"].shift(1)

    group_indexers = [data["empresa_key"], data["producto_key"]]

    for window in [3, 6, 12]:
        data[f"venta_neta_media_{window}"] = (
            shifted_sales.groupby(group_indexers)
            .transform(
                lambda s: s.rolling(window=window, min_periods=1).mean()
            )
        )

    for window in [3, 6]:
        data[f"venta_neta_std_{window}"] = (
            shifted_sales.groupby(group_indexers)
            .transform(
                lambda s: s.rolling(window=window, min_periods=2).std()
            )
        )

    for window in [3, 6, 12]:
        data[f"unidades_media_{window}"] = (
            shifted_units.groupby(group_indexers)
            .transform(
                lambda s: s.rolling(window=window, min_periods=1).mean()
            )
        )

    return data


def add_daily_demand_features(panel: pd.DataFrame) -> pd.DataFrame:
    data = panel.sort_values(
        ["empresa_key", "producto_key", "fecha"]
    ).reset_index(drop=True).copy()

    data["dia_semana"] = data["fecha"].dt.dayofweek.astype(int)
    data["dia_mes"] = data["fecha"].dt.day.astype(int)
    data["mes"] = data["fecha"].dt.month.astype(int)
    data["trimestre"] = data["fecha"].dt.quarter.astype(int)

    data["dia_semana_sin"] = np.sin(
        2.0 * np.pi * data["dia_semana"] / 7.0
    )
    data["dia_semana_cos"] = np.cos(
        2.0 * np.pi * data["dia_semana"] / 7.0
    )
    data["mes_sin"] = np.sin(2.0 * np.pi * data["mes"] / 12.0)
    data["mes_cos"] = np.cos(2.0 * np.pi * data["mes"] / 12.0)

    min_date = data["fecha"].min()
    data["tendencia_dia"] = (data["fecha"] - min_date).dt.days.astype(int)

    keys = ["empresa_key", "producto_key"]
    grouped = data.groupby(keys, group_keys=False)

    for lag in [1, 2, 3, 7, 14, 28]:
        data[f"unidades_lag_{lag}"] = grouped["unidades"].shift(lag)

    shifted_units = grouped["unidades"].shift(1)
    group_indexers = [data["empresa_key"], data["producto_key"]]

    for window in [7, 14, 28]:
        data[f"unidades_media_{window}"] = (
            shifted_units.groupby(group_indexers)
            .transform(
                lambda s: s.rolling(window=window, min_periods=1).mean()
            )
        )

    for window in [7, 28]:
        data[f"unidades_std_{window}"] = (
            shifted_units.groupby(group_indexers)
            .transform(
                lambda s: s.rolling(window=window, min_periods=2).std()
            )
        )

    return data


def determine_temporal_cutoffs(
    monthly_panel: pd.DataFrame,
    daily_panel: pd.DataFrame,
    settings: AISettings,
) -> TemporalCutoffs:
    sales_periods = sorted(
        pd.to_datetime(monthly_panel["periodo"].dropna().unique())
    )

    if len(sales_periods) <= settings.sales_horizon_months:
        raise RuntimeError(
            "No hay suficientes meses para separar entrenamiento y holdout comercial."
        )

    sales_holdout = sales_periods[-settings.sales_horizon_months:]

    demand_dates = sorted(
        pd.to_datetime(daily_panel["fecha"].dropna().unique())
    )

    if len(demand_dates) <= settings.demand_horizon_days:
        raise RuntimeError(
            "No hay suficientes días para separar entrenamiento y holdout de demanda."
        )

    demand_holdout = demand_dates[-settings.demand_horizon_days:]

    return TemporalCutoffs(
        sales_holdout_start=pd.Timestamp(sales_holdout[0]),
        sales_holdout_end=pd.Timestamp(sales_holdout[-1]),
        demand_holdout_start=pd.Timestamp(demand_holdout[0]),
        demand_holdout_end=pd.Timestamp(demand_holdout[-1]),
    )


def split_training_and_holdout(
    monthly_features: pd.DataFrame,
    daily_features: pd.DataFrame,
    cutoffs: TemporalCutoffs,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    sales_train = monthly_features[
        monthly_features["periodo"] < cutoffs.sales_holdout_start
    ].copy()

    sales_holdout = monthly_features[
        monthly_features["periodo"] >= cutoffs.sales_holdout_start
    ].copy()

    demand_train = daily_features[
        daily_features["fecha"] < cutoffs.demand_holdout_start
    ].copy()

    demand_holdout = daily_features[
        daily_features["fecha"] >= cutoffs.demand_holdout_start
    ].copy()

    if sales_train.empty or sales_holdout.empty:
        raise RuntimeError("El split temporal de ventas generó un conjunto vacío.")

    if demand_train.empty or demand_holdout.empty:
        raise RuntimeError("El split temporal de demanda generó un conjunto vacío.")

    return sales_train, sales_holdout, demand_train, demand_holdout
