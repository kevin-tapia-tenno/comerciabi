from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd


MONTH_NAMES = {
    1: "Enero",
    2: "Febrero",
    3: "Marzo",
    4: "Abril",
    5: "Mayo",
    6: "Junio",
    7: "Julio",
    8: "Agosto",
    9: "Septiembre",
    10: "Octubre",
    11: "Noviembre",
    12: "Diciembre",
}

DAY_NAMES = {
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado",
    7: "Domingo",
}


@dataclass
class TransformedData:
    dim_date: pd.DataFrame
    dim_company: pd.DataFrame
    dim_client: pd.DataFrame
    dim_product: pd.DataFrame
    dim_seller: pd.DataFrame
    dim_channel: pd.DataFrame
    dim_warehouse: pd.DataFrame
    fact_sales: pd.DataFrame
    fact_inventory: pd.DataFrame


def _to_numeric(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    result = frame.copy()
    for column in columns:
        result[column] = pd.to_numeric(result[column], errors="coerce").fillna(0)
    return result


def _local_date(timestamp: object, timezone_name: str) -> date:
    parsed = pd.Timestamp(timestamp)

    if pd.isna(parsed):
        raise ValueError("Se encontró una venta CONFIRMADA sin fecha_venta válida.")

    if parsed.tzinfo is None:
        parsed = parsed.tz_localize("UTC")

    try:
        timezone = ZoneInfo(timezone_name or "UTC")
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            f"Zona horaria inválida en empresas.zona_horaria: {timezone_name!r}."
        ) from exc

    return parsed.tz_convert(timezone).date()


def _today_for_timezone(timezone_name: str) -> date:
    try:
        timezone = ZoneInfo(timezone_name or "UTC")
    except ZoneInfoNotFoundError as exc:
        raise ValueError(
            f"Zona horaria inválida en empresas.zona_horaria: {timezone_name!r}."
        ) from exc

    return datetime.now(timezone).date()


def _build_date_dimension(dates: list[date]) -> pd.DataFrame:
    current_year = datetime.now().year
    start = date(current_year, 1, 1)
    end = date(current_year, 12, 31)

    if dates:
        start = min(start, min(dates))
        end = max(end, max(dates))

    calendar = pd.DataFrame({"fecha": pd.date_range(start=start, end=end, freq="D")})
    calendar["fecha_key"] = calendar["fecha"].dt.strftime("%Y%m%d").astype(int)
    calendar["anio"] = calendar["fecha"].dt.year.astype(int)
    calendar["trimestre"] = calendar["fecha"].dt.quarter.astype(int)
    calendar["mes"] = calendar["fecha"].dt.month.astype(int)
    calendar["mes_nombre"] = calendar["mes"].map(MONTH_NAMES)
    calendar["semana_anio"] = calendar["fecha"].dt.isocalendar().week.astype(int)
    calendar["dia"] = calendar["fecha"].dt.day.astype(int)
    calendar["dia_semana"] = calendar["fecha"].dt.isocalendar().day.astype(int)
    calendar["dia_semana_nombre"] = calendar["dia_semana"].map(DAY_NAMES)
    calendar["es_fin_semana"] = calendar["dia_semana"].isin([6, 7])
    calendar["fecha"] = calendar["fecha"].dt.date

    return calendar[
        [
            "fecha_key",
            "fecha",
            "anio",
            "trimestre",
            "mes",
            "mes_nombre",
            "semana_anio",
            "dia",
            "dia_semana",
            "dia_semana_nombre",
            "es_fin_semana",
        ]
    ]


def _transform_sales(
    datasets: dict[str, pd.DataFrame],
    company_timezones: dict[str, str],
) -> pd.DataFrame:
    sales = datasets["sales"].copy()
    details = datasets["sale_details"].copy()

    columns = [
        "source_venta_id",
        "source_empresa_id",
        "source_cliente_id",
        "source_producto_id",
        "source_vendedor_empresa_id",
        "source_canal_id",
        "codigo_venta",
        "moneda",
        "fecha",
        "fecha_key",
        "cantidad",
        "precio_unitario",
        "costo_unitario",
        "descuento_linea",
        "descuento_cabecera_asignado",
        "venta_neta",
        "impuesto_asignado",
        "facturacion",
        "costo_total",
        "utilidad_bruta",
    ]

    if sales.empty or details.empty:
        return pd.DataFrame(columns=columns)

    sales = _to_numeric(
        sales,
        ["descuento_total", "impuesto_total", "total"],
    )
    details = _to_numeric(
        details,
        [
            "cantidad",
            "precio_unitario",
            "costo_unitario",
            "descuento_linea",
            "total_linea",
        ],
    )

    merged = details.merge(
        sales,
        on="source_venta_id",
        how="inner",
        validate="many_to_one",
    )

    merged["zona_horaria"] = merged["source_empresa_id"].map(company_timezones)
    if merged["zona_horaria"].isna().any():
        missing = sorted(
            merged.loc[merged["zona_horaria"].isna(), "source_empresa_id"]
            .astype(str)
            .unique()
            .tolist()
        )
        raise ValueError(
            "Hay ventas asociadas a empresas sin zona horaria extraída: "
            + ", ".join(missing)
        )

    merged["fecha"] = merged.apply(
        lambda row: _local_date(row["fecha_venta"], row["zona_horaria"]),
        axis=1,
    )
    merged["fecha_key"] = merged["fecha"].map(lambda value: int(value.strftime("%Y%m%d")))

    line_sum = merged.groupby("source_venta_id")["total_linea"].transform("sum")
    line_count = merged.groupby("source_venta_id")["source_venta_id"].transform("size")

    # Repartimos los importes de cabecera entre las líneas para mantener
    # un hecho a nivel de detalle sin duplicar el total de la venta.
    share = pd.Series(0.0, index=merged.index)
    positive_mask = line_sum.abs() > 0.0000001
    share.loc[positive_mask] = (
        merged.loc[positive_mask, "total_linea"] / line_sum.loc[positive_mask]
    )
    share.loc[~positive_mask] = 1 / line_count.loc[~positive_mask]

    merged["venta_neta"] = merged["total_linea"].round(4)
    merged["descuento_cabecera_asignado"] = (
        merged["descuento_total"] * share
    ).round(4)
    merged["impuesto_asignado"] = (merged["impuesto_total"] * share).round(4)
    merged["facturacion"] = (merged["total"] * share).round(4)
    merged["costo_total"] = (
        merged["cantidad"] * merged["costo_unitario"]
    ).round(4)
    merged["utilidad_bruta"] = (
        merged["venta_neta"] - merged["costo_total"]
    ).round(4)

    for column in [
        "cantidad",
        "precio_unitario",
        "costo_unitario",
        "descuento_linea",
    ]:
        merged[column] = merged[column].round(4)

    return merged[columns].copy()


def _transform_inventory(
    datasets: dict[str, pd.DataFrame],
    company_timezones: dict[str, str],
) -> pd.DataFrame:
    inventory = datasets["inventory"].copy()
    products = datasets["products"][
        ["source_producto_id", "source_empresa_id", "costo_actual"]
    ].copy()
    warehouses = datasets["warehouses"][
        ["source_almacen_id", "source_empresa_id"]
    ].copy()

    columns = [
        "source_empresa_id",
        "source_producto_id",
        "source_almacen_id",
        "fecha",
        "fecha_key",
        "stock_actual",
        "stock_minimo",
        "costo_unitario",
        "valor_stock",
        "es_critico",
        "es_agotado",
    ]

    if inventory.empty:
        return pd.DataFrame(columns=columns)

    inventory = _to_numeric(inventory, ["stock_actual", "stock_minimo"])
    products = _to_numeric(products, ["costo_actual"])

    merged = inventory.merge(
        products,
        on="source_producto_id",
        how="left",
        validate="many_to_one",
    ).merge(
        warehouses,
        on="source_almacen_id",
        how="left",
        validate="many_to_one",
        suffixes=("_producto", "_almacen"),
    )

    if merged["source_empresa_id_producto"].isna().any():
        raise ValueError("Hay existencias asociadas a productos inexistentes.")

    if merged["source_empresa_id_almacen"].isna().any():
        raise ValueError("Hay existencias asociadas a almacenes inexistentes.")

    mismatch = (
        merged["source_empresa_id_producto"]
        != merged["source_empresa_id_almacen"]
    )
    if mismatch.any():
        raise ValueError(
            "Se encontró una existencia cuyo producto y almacén pertenecen "
            "a empresas distintas."
        )

    merged["source_empresa_id"] = merged["source_empresa_id_producto"]
    merged["zona_horaria"] = merged["source_empresa_id"].map(company_timezones)

    if merged["zona_horaria"].isna().any():
        raise ValueError("Hay existencias asociadas a una empresa sin zona horaria.")

    today_by_timezone = {
        timezone_name: _today_for_timezone(timezone_name)
        for timezone_name in merged["zona_horaria"].dropna().unique().tolist()
    }
    merged["fecha"] = merged["zona_horaria"].map(today_by_timezone)
    merged["fecha_key"] = merged["fecha"].map(lambda value: int(value.strftime("%Y%m%d")))
    merged["costo_unitario"] = merged["costo_actual"].round(4)
    merged["valor_stock"] = (
        merged["stock_actual"] * merged["costo_unitario"]
    ).round(4)
    merged["es_critico"] = (
        (merged["stock_minimo"] > 0)
        & (merged["stock_actual"] <= merged["stock_minimo"])
    )
    merged["es_agotado"] = merged["stock_actual"] <= 0

    merged["stock_actual"] = merged["stock_actual"].round(3)
    merged["stock_minimo"] = merged["stock_minimo"].round(3)

    return merged[columns].copy()


def transform_operational_data(
    datasets: dict[str, pd.DataFrame],
) -> TransformedData:
    companies = datasets["companies"].copy()

    if companies.empty:
        raise ValueError("No existen empresas en la base operacional.")

    company_timezones = dict(
        zip(
            companies["source_empresa_id"].astype(str),
            companies["zona_horaria"].fillna("UTC").astype(str),
        )
    )

    fact_sales = _transform_sales(datasets, company_timezones)
    fact_inventory = _transform_inventory(datasets, company_timezones)

    date_values: list[date] = []
    if not fact_sales.empty:
        date_values.extend(fact_sales["fecha"].tolist())
    if not fact_inventory.empty:
        date_values.extend(fact_inventory["fecha"].tolist())

    dim_date = _build_date_dimension(date_values)

    dim_company = companies[
        ["source_empresa_id", "nombre", "zona_horaria", "activo"]
    ].copy()

    dim_client = datasets["clients"][
        ["source_cliente_id", "source_empresa_id", "nombre_completo"]
    ].copy()

    dim_product = datasets["products"][
        [
            "source_producto_id",
            "source_empresa_id",
            "sku",
            "nombre",
            "categoria",
            "costo_actual",
            "activo",
        ]
    ].copy()
    dim_product["costo_actual"] = pd.to_numeric(
        dim_product["costo_actual"], errors="coerce"
    ).fillna(0).round(4)

    dim_seller = datasets["sellers"][
        [
            "source_vendedor_empresa_id",
            "source_empresa_id",
            "nombre_completo",
            "rol",
            "activo",
        ]
    ].copy()

    dim_channel = datasets["channels"][
        ["source_canal_id", "nombre"]
    ].copy()

    dim_warehouse = datasets["warehouses"][
        ["source_almacen_id", "source_empresa_id", "nombre", "activo"]
    ].copy()

    return TransformedData(
        dim_date=dim_date,
        dim_company=dim_company,
        dim_client=dim_client,
        dim_product=dim_product,
        dim_seller=dim_seller,
        dim_channel=dim_channel,
        dim_warehouse=dim_warehouse,
        fact_sales=fact_sales,
        fact_inventory=fact_inventory,
    )
