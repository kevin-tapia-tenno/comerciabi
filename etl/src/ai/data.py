from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sqlalchemy import Engine, text

from .config import AISettings


@dataclass(frozen=True)
class AIDataBundle:
    """Conjunto de datos seleccionado para entrenamiento y validación."""

    origin: str
    reason: str
    reference_date: pd.Timestamp
    sales_history: pd.DataFrame
    inventory: pd.DataFrame
    real_sales_rows: int
    real_sales_months: int


REAL_SALES_QUERY = """
select
    fv.empresa_key,
    de.nombre as empresa,
    df.fecha,
    fv.producto_key,
    dp.sku,
    dp.nombre as producto,
    coalesce(dp.categoria, 'Sin categoría') as categoria,
    sum(fv.cantidad)::double precision as unidades,
    sum(fv.venta_neta)::double precision as venta_neta,
    sum(fv.utilidad_bruta)::double precision as utilidad_bruta
from analytics.fact_ventas fv
join analytics.dim_fecha df
    on df.fecha_key = fv.fecha_key
join analytics.dim_empresa de
    on de.empresa_key = fv.empresa_key
join analytics.dim_producto dp
    on dp.producto_key = fv.producto_key
group by
    fv.empresa_key,
    de.nombre,
    df.fecha,
    fv.producto_key,
    dp.sku,
    dp.nombre,
    dp.categoria
order by
    df.fecha,
    fv.empresa_key,
    fv.producto_key;
"""


LATEST_INVENTORY_QUERY = """
with ultima_fecha_empresa as (
    select
        empresa_key,
        max(fecha_key) as fecha_key
    from analytics.fact_inventario_snapshot
    group by empresa_key
)
select
    fi.empresa_key,
    de.nombre as empresa,
    df.fecha,
    fi.producto_key,
    dp.sku,
    dp.nombre as producto,
    coalesce(dp.categoria, 'Sin categoría') as categoria,
    fi.almacen_key,
    da.nombre as almacen,
    fi.stock_actual::double precision as stock_actual,
    fi.stock_minimo::double precision as stock_minimo,
    fi.costo_unitario::double precision as costo_unitario,
    fi.valor_stock::double precision as valor_stock,
    fi.es_critico,
    fi.es_agotado
from analytics.fact_inventario_snapshot fi
join ultima_fecha_empresa ufe
    on ufe.empresa_key = fi.empresa_key
    and ufe.fecha_key = fi.fecha_key
join analytics.dim_fecha df
    on df.fecha_key = fi.fecha_key
join analytics.dim_empresa de
    on de.empresa_key = fi.empresa_key
join analytics.dim_producto dp
    on dp.producto_key = fi.producto_key
join analytics.dim_almacen da
    on da.almacen_key = fi.almacen_key
order by
    fi.empresa_key,
    dp.nombre,
    da.nombre;
"""


def _read_dataframe(engine: Engine, query: str) -> pd.DataFrame:
    with engine.connect() as connection:
        return pd.read_sql_query(text(query), connection)


def load_real_sales(engine: Engine) -> pd.DataFrame:
    """Extrae ventas reales agregadas por fecha y producto."""

    sales = _read_dataframe(engine, REAL_SALES_QUERY)

    if not sales.empty:
        sales["fecha"] = pd.to_datetime(sales["fecha"])
        sales["origen_datos"] = "REAL"

    return sales


def load_latest_inventory(engine: Engine) -> pd.DataFrame:
    """Extrae el último snapshot disponible de inventario por empresa."""

    inventory = _read_dataframe(engine, LATEST_INVENTORY_QUERY)

    if not inventory.empty:
        inventory["fecha"] = pd.to_datetime(inventory["fecha"])

    return inventory


def _count_real_months(sales: pd.DataFrame) -> int:
    if sales.empty:
        return 0

    periods = sales["fecha"].dt.to_period("M")
    return int(periods.nunique())


def _real_data_is_sufficient(
    sales: pd.DataFrame,
    settings: AISettings,
) -> tuple[bool, int, int]:
    rows = int(len(sales))
    months = _count_real_months(sales)

    sufficient = (
        rows >= settings.min_real_sales_rows
        and months >= settings.min_real_sales_months
    )

    return sufficient, rows, months


def _reference_date(
    sales: pd.DataFrame,
    inventory: pd.DataFrame,
) -> pd.Timestamp:
    candidates: list[pd.Timestamp] = []

    if not sales.empty:
        candidates.append(pd.Timestamp(sales["fecha"].max()))

    if not inventory.empty:
        candidates.append(pd.Timestamp(inventory["fecha"].max()))

    if not candidates:
        raise RuntimeError(
            "No existen ventas ni snapshots de inventario en analytics. "
            "Ejecuta primero el ETL de la Fase 12."
        )

    return max(candidates).normalize()


def generate_demo_history(
    inventory: pd.DataFrame,
    reference_date: pd.Timestamp,
    settings: AISettings,
) -> pd.DataFrame:
    """
    Genera historia DEMO reproducible sin insertar datos falsos en fact_ventas.

    Los productos, empresas, categorías y costos parten del modelo analítico
    real. Solo se sintetiza el comportamiento histórico necesario para
    practicar entrenamiento, validación y pronósticos.
    """

    if inventory.empty:
        raise RuntimeError(
            "No hay inventario disponible para construir el dataset DEMO."
        )

    start_date = (
        reference_date
        - pd.DateOffset(months=settings.demo_months)
        + pd.Timedelta(days=1)
    ).normalize()

    dates = pd.date_range(start=start_date, end=reference_date, freq="D")

    unique_products = (
        inventory[
            [
                "empresa_key",
                "empresa",
                "producto_key",
                "sku",
                "producto",
                "categoria",
                "costo_unitario",
                "stock_actual",
            ]
        ]
        .drop_duplicates(
            subset=["empresa_key", "producto_key"],
            keep="first",
        )
        .sort_values(["empresa_key", "producto_key"])
        .reset_index(drop=True)
    )

    frames: list[pd.DataFrame] = []

    for product_position, row in unique_products.iterrows():
        product_key = int(row["producto_key"])
        seed = (
            settings.random_seed
            + (product_key * 101)
            + (product_position * 17)
        )
        rng = np.random.default_rng(seed)

        cost = max(float(row["costo_unitario"]), 0.0)
        stock = max(float(row["stock_actual"]), 0.0)

        base_units = float(np.clip(np.sqrt(stock + 1.0) / 2.5, 1.2, 7.5))
        phase = (product_position + 1) * 0.55

        day_index = np.arange(len(dates), dtype=float)
        weekday = dates.dayofweek.to_numpy()
        day_of_year = dates.dayofyear.to_numpy()

        weekly_factor = np.where(weekday < 5, 1.0, 0.82)
        annual_factor = (
            1.0
            + 0.18
            * np.sin((2.0 * np.pi * day_of_year / 365.25) + phase)
        )
        trend_factor = 1.0 + (0.00045 * day_index)

        expected_units = np.clip(
            base_units * weekly_factor * annual_factor * trend_factor,
            0.15,
            None,
        )

        units = rng.poisson(expected_units).astype(float)

        list_price = max(cost * 1.65, cost + 5.0, 12.0)
        price_factor = rng.uniform(0.96, 1.02, size=len(dates))

        effective_price = list_price * price_factor
        sales = units * effective_price
        gross_profit = np.maximum(sales - (units * cost), 0.0)

        product_frame = pd.DataFrame(
            {
                "empresa_key": int(row["empresa_key"]),
                "empresa": str(row["empresa"]),
                "fecha": dates,
                "producto_key": product_key,
                "sku": str(row["sku"]),
                "producto": str(row["producto"]),
                "categoria": str(row["categoria"]),
                "unidades": units,
                "venta_neta": np.round(sales, 4),
                "utilidad_bruta": np.round(gross_profit, 4),
                "origen_datos": "DEMO",
            }
        )

        frames.append(product_frame)

    demo = pd.concat(frames, ignore_index=True)

    return demo.sort_values(
        ["fecha", "empresa_key", "producto_key"]
    ).reset_index(drop=True)


def load_ai_data(
    engine: Engine,
    settings: AISettings | None = None,
) -> AIDataBundle:
    """Selecciona automáticamente datos REALES o DEMO."""

    settings = settings or AISettings()

    inventory = load_latest_inventory(engine)
    real_sales = load_real_sales(engine)

    sufficient, rows, months = _real_data_is_sufficient(
        real_sales,
        settings,
    )

    reference_date = _reference_date(real_sales, inventory)

    if sufficient:
        reason = (
            "Se utilizarán datos REALES: "
            f"{rows} observaciones agregadas y "
            f"{months} meses disponibles."
        )
        sales_history = real_sales.copy()
        origin = "REAL"
    else:
        reason = (
            "Se utilizarán datos DEMO porque la historia real todavía "
            "no alcanza el mínimo para entrenar de forma responsable: "
            f"{rows}/{settings.min_real_sales_rows} observaciones y "
            f"{months}/{settings.min_real_sales_months} meses."
        )
        sales_history = generate_demo_history(
            inventory=inventory,
            reference_date=reference_date,
            settings=settings,
        )
        origin = "DEMO"

    return AIDataBundle(
        origin=origin,
        reason=reason,
        reference_date=reference_date,
        sales_history=sales_history,
        inventory=inventory,
        real_sales_rows=rows,
        real_sales_months=months,
    )
