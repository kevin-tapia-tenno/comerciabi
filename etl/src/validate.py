from __future__ import annotations

import pandas as pd

from .transform import TransformedData


class DataValidationError(RuntimeError):
    """Se detectaron datos incompatibles con el modelo analítico."""


def _assert_unique(frame: pd.DataFrame, column: str, label: str) -> None:
    if frame.empty:
        return

    duplicated = frame[column].duplicated(keep=False)
    if duplicated.any():
        examples = frame.loc[duplicated, column].astype(str).head(5).tolist()
        raise DataValidationError(
            f"{label}: existen identificadores duplicados en {column}. "
            f"Ejemplos: {examples}"
        )


def validate_transformed_data(data: TransformedData) -> list[str]:
    warnings: list[str] = []

    _assert_unique(data.dim_company, "source_empresa_id", "Empresas")
    _assert_unique(data.dim_client, "source_cliente_id", "Clientes")
    _assert_unique(data.dim_product, "source_producto_id", "Productos")
    _assert_unique(
        data.dim_seller,
        "source_vendedor_empresa_id",
        "Vendedores",
    )
    _assert_unique(data.dim_channel, "source_canal_id", "Canales")
    _assert_unique(data.dim_warehouse, "source_almacen_id", "Almacenes")
    _assert_unique(data.dim_date, "fecha_key", "Fecha")

    if data.fact_sales.empty:
        warnings.append(
            "No existen ventas CONFIRMADAS. El hecho de ventas quedará vacío, "
            "pero el modelo seguirá siendo válido."
        )
    else:
        if (data.fact_sales["cantidad"] <= 0).any():
            raise DataValidationError(
                "Hay líneas de ventas CONFIRMADAS con cantidad menor o igual a cero."
            )

        if (data.fact_sales["costo_unitario"] < 0).any():
            raise DataValidationError(
                "Hay líneas de ventas CONFIRMADAS con costo unitario negativo."
            )

        if data.fact_sales["source_producto_id"].isna().any():
            raise DataValidationError("Hay líneas de venta sin producto.")

    if data.fact_inventory.empty:
        warnings.append("No existen registros de inventario para crear snapshots.")
    else:
        if (data.fact_inventory["stock_actual"] < 0).any():
            raise DataValidationError(
                "Se encontró stock negativo en existencias_producto."
            )

        duplicated_inventory = data.fact_inventory.duplicated(
            subset=[
                "fecha_key",
                "source_empresa_id",
                "source_producto_id",
                "source_almacen_id",
            ],
            keep=False,
        )
        if duplicated_inventory.any():
            raise DataValidationError(
                "El snapshot de inventario contiene duplicados para "
                "fecha + empresa + producto + almacén."
            )

    company_ids = set(data.dim_company["source_empresa_id"].astype(str))
    product_ids = set(data.dim_product["source_producto_id"].astype(str))
    client_ids = set(data.dim_client["source_cliente_id"].astype(str))
    seller_ids = set(data.dim_seller["source_vendedor_empresa_id"].astype(str))
    channel_ids = set(data.dim_channel["source_canal_id"].astype(str))
    warehouse_ids = set(data.dim_warehouse["source_almacen_id"].astype(str))

    if not data.fact_sales.empty:
        unknown_companies = set(data.fact_sales["source_empresa_id"].astype(str)) - company_ids
        unknown_products = set(data.fact_sales["source_producto_id"].astype(str)) - product_ids
        unknown_clients = set(
            data.fact_sales["source_cliente_id"].dropna().astype(str)
        ) - client_ids
        unknown_sellers = set(
            data.fact_sales["source_vendedor_empresa_id"].dropna().astype(str)
        ) - seller_ids
        unknown_channels = set(
            data.fact_sales["source_canal_id"].dropna().astype(str)
        ) - channel_ids

        if unknown_companies:
            raise DataValidationError(
                f"Ventas con empresas no encontradas: {sorted(unknown_companies)}"
            )
        if unknown_products:
            raise DataValidationError(
                f"Ventas con productos no encontrados: {sorted(unknown_products)}"
            )
        if unknown_clients:
            raise DataValidationError(
                f"Ventas con clientes no encontrados: {sorted(unknown_clients)}"
            )
        if unknown_sellers:
            raise DataValidationError(
                f"Ventas con vendedores no encontrados: {sorted(unknown_sellers)}"
            )
        if unknown_channels:
            raise DataValidationError(
                f"Ventas con canales no encontrados: {sorted(unknown_channels)}"
            )

    if not data.fact_inventory.empty:
        unknown_companies = set(
            data.fact_inventory["source_empresa_id"].astype(str)
        ) - company_ids
        unknown_products = set(
            data.fact_inventory["source_producto_id"].astype(str)
        ) - product_ids
        unknown_warehouses = set(
            data.fact_inventory["source_almacen_id"].astype(str)
        ) - warehouse_ids

        if unknown_companies:
            raise DataValidationError(
                f"Inventario con empresas no encontradas: {sorted(unknown_companies)}"
            )
        if unknown_products:
            raise DataValidationError(
                f"Inventario con productos no encontrados: {sorted(unknown_products)}"
            )
        if unknown_warehouses:
            raise DataValidationError(
                f"Inventario con almacenes no encontrados: {sorted(unknown_warehouses)}"
            )

    return warnings
