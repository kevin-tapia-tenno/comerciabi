from __future__ import annotations

from typing import Final

import pandas as pd
from sqlalchemy import Engine, text


QUERIES: Final[dict[str, str]] = {
    "companies": """
        select
          e.id::text as source_empresa_id,
          e.nombre,
          e.zona_horaria,
          e.activo
        from public.empresas e
        order by e.id
    """,
    "clients": """
        select
          c.id::text as source_cliente_id,
          c.empresa_id::text as source_empresa_id,
          c.nombre_completo
        from public.clientes c
        order by c.id
    """,
    "products": """
        select
          p.id::text as source_producto_id,
          p.empresa_id::text as source_empresa_id,
          p.sku,
          p.nombre,
          c.nombre as categoria,
          p.costo_actual,
          p.activo
        from public.productos p
        left join public.categorias c
          on c.id = p.categoria_id
        order by p.id
    """,
    "sellers": """
        select
          ue.id::text as source_vendedor_empresa_id,
          ue.empresa_id::text as source_empresa_id,
          concat_ws(' ', pf.nombres, pf.apellidos) as nombre_completo,
          ue.rol::text as rol,
          ue.activo
        from public.usuarios_empresa ue
        join public.perfiles pf
          on pf.id = ue.perfil_id
        order by ue.id
    """,
    "channels": """
        select
          cv.id::text as source_canal_id,
          cv.nombre
        from public.canales_venta cv
        order by cv.id
    """,
    "warehouses": """
        select
          a.id::text as source_almacen_id,
          a.empresa_id::text as source_empresa_id,
          a.nombre,
          a.activo
        from public.almacenes a
        order by a.id
    """,
    "sales": """
        select
          v.id::text as source_venta_id,
          v.empresa_id::text as source_empresa_id,
          v.codigo as codigo_venta,
          v.cliente_id::text as source_cliente_id,
          v.vendedor_empresa_id::text as source_vendedor_empresa_id,
          v.canal_venta_id::text as source_canal_id,
          v.fecha_venta,
          v.descuento_total,
          v.impuesto_total,
          v.total,
          v.moneda
        from public.ventas v
        where v.estado = 'CONFIRMADA'
        order by v.fecha_venta, v.id
    """,
    "sale_details": """
        select
          d.venta_id::text as source_venta_id,
          d.producto_id::text as source_producto_id,
          d.cantidad,
          d.precio_unitario,
          d.costo_unitario,
          d.descuento_linea,
          d.total_linea
        from public.detalle_venta d
        join public.ventas v
          on v.id = d.venta_id
        where v.estado = 'CONFIRMADA'
        order by d.venta_id, d.producto_id
    """,
    "inventory": """
        select
          e.almacen_id::text as source_almacen_id,
          e.producto_id::text as source_producto_id,
          e.stock_actual,
          e.stock_minimo
        from public.existencias_producto e
        order by e.almacen_id, e.producto_id
    """,
}


def extract_operational_data(engine: Engine) -> dict[str, pd.DataFrame]:
    datasets: dict[str, pd.DataFrame] = {}

    print("Extrayendo datos operacionales...")

    with engine.connect() as connection:
        for name, query in QUERIES.items():
            frame = pd.read_sql_query(text(query), connection)
            datasets[name] = frame
            print(f"  {name}: {len(frame):,} filas")

    return datasets
