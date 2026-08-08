from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import pandas as pd
from sqlalchemy import Engine, text

from .transform import TransformedData


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []

    clean = frame.astype(object).where(pd.notna(frame), None)
    return clean.to_dict(orient="records")


def _execute_many(connection, sql: str, records: Iterable[dict[str, Any]]) -> None:
    rows = list(records)
    if rows:
        connection.execute(text(sql), rows)


def _fetch_key_map(connection, table: str, source_column: str, key_column: str) -> dict[str, int]:
    rows = connection.execute(
        text(
            f"select {source_column}::text as source_id, {key_column} as dimension_key "
            f"from analytics.{table}"
        )
    ).mappings()

    return {str(row["source_id"]): int(row["dimension_key"]) for row in rows}


def _map_required(series: pd.Series, mapping: dict[str, int], label: str) -> pd.Series:
    mapped = series.astype(str).map(mapping)
    if mapped.isna().any():
        missing = sorted(series.loc[mapped.isna()].astype(str).unique().tolist())
        raise RuntimeError(
            f"No fue posible resolver la dimensión {label}. IDs faltantes: {missing[:10]}"
        )
    return mapped.astype(int)


def _map_optional(series: pd.Series, mapping: dict[str, int]) -> pd.Series:
    def resolve(value: Any) -> int | None:
        if value is None or pd.isna(value):
            return None
        return mapping.get(str(value))

    return series.map(resolve)


def load_analytics_model(
    engine: Engine,
    data: TransformedData,
    etl_run_id: int,
) -> tuple[int, int]:
    print("Cargando modelo analítico...")

    with engine.begin() as connection:
        _execute_many(
            connection,
            """
            insert into analytics.dim_fecha (
              fecha_key, fecha, anio, trimestre, mes, mes_nombre,
              semana_anio, dia, dia_semana, dia_semana_nombre, es_fin_semana
            ) values (
              :fecha_key, :fecha, :anio, :trimestre, :mes, :mes_nombre,
              :semana_anio, :dia, :dia_semana, :dia_semana_nombre, :es_fin_semana
            )
            on conflict (fecha_key) do update set
              fecha = excluded.fecha,
              anio = excluded.anio,
              trimestre = excluded.trimestre,
              mes = excluded.mes,
              mes_nombre = excluded.mes_nombre,
              semana_anio = excluded.semana_anio,
              dia = excluded.dia,
              dia_semana = excluded.dia_semana,
              dia_semana_nombre = excluded.dia_semana_nombre,
              es_fin_semana = excluded.es_fin_semana
            """,
            _records(data.dim_date),
        )

        _execute_many(
            connection,
            """
            insert into analytics.dim_empresa (
              source_empresa_id, nombre, zona_horaria, activo
            ) values (
              :source_empresa_id, :nombre, :zona_horaria, :activo
            )
            on conflict (source_empresa_id) do update set
              nombre = excluded.nombre,
              zona_horaria = excluded.zona_horaria,
              activo = excluded.activo,
              actualizado_en = now()
            """,
            _records(data.dim_company),
        )

        company_map = _fetch_key_map(
            connection,
            "dim_empresa",
            "source_empresa_id",
            "empresa_key",
        )

        clients = data.dim_client.copy()
        if not clients.empty:
            clients["empresa_key"] = _map_required(
                clients["source_empresa_id"], company_map, "empresa de cliente"
            )
        _execute_many(
            connection,
            """
            insert into analytics.dim_cliente (
              source_cliente_id, empresa_key, nombre_completo
            ) values (
              :source_cliente_id, :empresa_key, :nombre_completo
            )
            on conflict (source_cliente_id) do update set
              empresa_key = excluded.empresa_key,
              nombre_completo = excluded.nombre_completo,
              actualizado_en = now()
            """,
            _records(clients),
        )

        products = data.dim_product.copy()
        if not products.empty:
            products["empresa_key"] = _map_required(
                products["source_empresa_id"], company_map, "empresa de producto"
            )
        _execute_many(
            connection,
            """
            insert into analytics.dim_producto (
              source_producto_id, empresa_key, sku, nombre,
              categoria, costo_actual, activo
            ) values (
              :source_producto_id, :empresa_key, :sku, :nombre,
              :categoria, :costo_actual, :activo
            )
            on conflict (source_producto_id) do update set
              empresa_key = excluded.empresa_key,
              sku = excluded.sku,
              nombre = excluded.nombre,
              categoria = excluded.categoria,
              costo_actual = excluded.costo_actual,
              activo = excluded.activo,
              actualizado_en = now()
            """,
            _records(products),
        )

        sellers = data.dim_seller.copy()
        if not sellers.empty:
            sellers["empresa_key"] = _map_required(
                sellers["source_empresa_id"], company_map, "empresa de vendedor"
            )
        _execute_many(
            connection,
            """
            insert into analytics.dim_vendedor (
              source_vendedor_empresa_id, empresa_key,
              nombre_completo, rol, activo
            ) values (
              :source_vendedor_empresa_id, :empresa_key,
              :nombre_completo, :rol, :activo
            )
            on conflict (source_vendedor_empresa_id) do update set
              empresa_key = excluded.empresa_key,
              nombre_completo = excluded.nombre_completo,
              rol = excluded.rol,
              activo = excluded.activo,
              actualizado_en = now()
            """,
            _records(sellers),
        )

        _execute_many(
            connection,
            """
            insert into analytics.dim_canal (
              source_canal_id, nombre
            ) values (
              :source_canal_id, :nombre
            )
            on conflict (source_canal_id) do update set
              nombre = excluded.nombre,
              actualizado_en = now()
            """,
            _records(data.dim_channel),
        )

        warehouses = data.dim_warehouse.copy()
        if not warehouses.empty:
            warehouses["empresa_key"] = _map_required(
                warehouses["source_empresa_id"], company_map, "empresa de almacén"
            )
        _execute_many(
            connection,
            """
            insert into analytics.dim_almacen (
              source_almacen_id, empresa_key, nombre, activo
            ) values (
              :source_almacen_id, :empresa_key, :nombre, :activo
            )
            on conflict (source_almacen_id) do update set
              empresa_key = excluded.empresa_key,
              nombre = excluded.nombre,
              activo = excluded.activo,
              actualizado_en = now()
            """,
            _records(warehouses),
        )

        client_map = _fetch_key_map(
            connection, "dim_cliente", "source_cliente_id", "cliente_key"
        )
        product_map = _fetch_key_map(
            connection, "dim_producto", "source_producto_id", "producto_key"
        )
        seller_map = _fetch_key_map(
            connection,
            "dim_vendedor",
            "source_vendedor_empresa_id",
            "vendedor_key",
        )
        channel_map = _fetch_key_map(
            connection, "dim_canal", "source_canal_id", "canal_key"
        )
        warehouse_map = _fetch_key_map(
            connection, "dim_almacen", "source_almacen_id", "almacen_key"
        )

        # Para ventas usamos recarga completa: el origen transaccional es la
        # fuente de verdad y el volumen del MVP es pequeño. Esto vuelve el ETL
        # idempotente y evita duplicados por reejecución.
        connection.execute(text("delete from analytics.fact_ventas"))

        sales = data.fact_sales.copy()
        if not sales.empty:
            sales["etl_ejecucion_id"] = etl_run_id
            sales["empresa_key"] = _map_required(
                sales["source_empresa_id"], company_map, "empresa de venta"
            )
            sales["cliente_key"] = _map_optional(
                sales["source_cliente_id"], client_map
            )
            sales["producto_key"] = _map_required(
                sales["source_producto_id"], product_map, "producto de venta"
            )
            sales["vendedor_key"] = _map_optional(
                sales["source_vendedor_empresa_id"], seller_map
            )
            sales["canal_key"] = _map_optional(
                sales["source_canal_id"], channel_map
            )

        _execute_many(
            connection,
            """
            insert into analytics.fact_ventas (
              etl_ejecucion_id,
              source_venta_id,
              fecha_key,
              empresa_key,
              cliente_key,
              producto_key,
              vendedor_key,
              canal_key,
              codigo_venta,
              moneda,
              cantidad,
              precio_unitario,
              costo_unitario,
              descuento_linea,
              descuento_cabecera_asignado,
              venta_neta,
              impuesto_asignado,
              facturacion,
              costo_total,
              utilidad_bruta
            ) values (
              :etl_ejecucion_id,
              :source_venta_id,
              :fecha_key,
              :empresa_key,
              :cliente_key,
              :producto_key,
              :vendedor_key,
              :canal_key,
              :codigo_venta,
              :moneda,
              :cantidad,
              :precio_unitario,
              :costo_unitario,
              :descuento_linea,
              :descuento_cabecera_asignado,
              :venta_neta,
              :impuesto_asignado,
              :facturacion,
              :costo_total,
              :utilidad_bruta
            )
            """,
            _records(sales),
        )

        inventory = data.fact_inventory.copy()
        if not inventory.empty:
            inventory["etl_ejecucion_id"] = etl_run_id
            inventory["empresa_key"] = _map_required(
                inventory["source_empresa_id"], company_map, "empresa de inventario"
            )
            inventory["producto_key"] = _map_required(
                inventory["source_producto_id"], product_map, "producto de inventario"
            )
            inventory["almacen_key"] = _map_required(
                inventory["source_almacen_id"], warehouse_map, "almacén de inventario"
            )

        _execute_many(
            connection,
            """
            insert into analytics.fact_inventario_snapshot (
              etl_ejecucion_id,
              fecha_key,
              empresa_key,
              producto_key,
              almacen_key,
              stock_actual,
              stock_minimo,
              costo_unitario,
              valor_stock,
              es_critico,
              es_agotado
            ) values (
              :etl_ejecucion_id,
              :fecha_key,
              :empresa_key,
              :producto_key,
              :almacen_key,
              :stock_actual,
              :stock_minimo,
              :costo_unitario,
              :valor_stock,
              :es_critico,
              :es_agotado
            )
            on conflict (
              fecha_key,
              empresa_key,
              producto_key,
              almacen_key
            ) do update set
              etl_ejecucion_id = excluded.etl_ejecucion_id,
              stock_actual = excluded.stock_actual,
              stock_minimo = excluded.stock_minimo,
              costo_unitario = excluded.costo_unitario,
              valor_stock = excluded.valor_stock,
              es_critico = excluded.es_critico,
              es_agotado = excluded.es_agotado,
              cargado_en = now()
            """,
            _records(inventory),
        )

    return len(data.fact_sales), len(data.fact_inventory)
