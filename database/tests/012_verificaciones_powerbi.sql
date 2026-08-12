-- ComercioBI
-- Verificaciones de la Fase 13: Power BI
--
-- Ejecutar DESPUÉS de:
--   1) haber completado la Fase 12;
--   2) haber ejecutado al menos una vez el ETL;
--   3) haber construido el modelo semántico en Power BI.
--
-- Estas consultas NO modifican datos.

-- ================================================================
-- PRUEBA 1. Objetos fuente requeridos por Power BI
-- Resultado esperado:
--   7 dimensiones + 2 hechos = 9 tablas.
-- ================================================================

select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'analytics'
  and table_name in (
    'dim_fecha',
    'dim_empresa',
    'dim_cliente',
    'dim_producto',
    'dim_vendedor',
    'dim_canal',
    'dim_almacen',
    'fact_ventas',
    'fact_inventario_snapshot'
  )
order by table_name;

-- ================================================================
-- PRUEBA 2. Volumen disponible
-- En el estado actual del proyecto se espera, como mínimo:
--   dim_fecha >= 365
--   dim_empresa >= 1
--   dim_cliente >= 1
--   dim_producto >= 1
--   dim_vendedor >= 1
--   dim_canal >= 1
--   dim_almacen >= 1
--   fact_ventas >= 1
--   fact_inventario_snapshot >= 1
-- ================================================================

select 'dim_fecha' as objeto, count(*) as filas from analytics.dim_fecha
union all
select 'dim_empresa', count(*) from analytics.dim_empresa
union all
select 'dim_cliente', count(*) from analytics.dim_cliente
union all
select 'dim_producto', count(*) from analytics.dim_producto
union all
select 'dim_vendedor', count(*) from analytics.dim_vendedor
union all
select 'dim_canal', count(*) from analytics.dim_canal
union all
select 'dim_almacen', count(*) from analytics.dim_almacen
union all
select 'fact_ventas', count(*) from analytics.fact_ventas
union all
select 'fact_inventario_snapshot', count(*)
from analytics.fact_inventario_snapshot
order by objeto;

-- ================================================================
-- PRUEBA 3. Integridad de claves de fact_ventas
-- Resultado esperado: 0 filas.
-- ================================================================

select
  f.fact_venta_key,
  f.fecha_key,
  f.empresa_key,
  f.producto_key,
  f.cliente_key,
  f.vendedor_key,
  f.canal_key
from analytics.fact_ventas f
left join analytics.dim_fecha df
  on df.fecha_key = f.fecha_key
left join analytics.dim_empresa de
  on de.empresa_key = f.empresa_key
left join analytics.dim_producto dp
  on dp.producto_key = f.producto_key
left join analytics.dim_cliente dc
  on dc.cliente_key = f.cliente_key
left join analytics.dim_vendedor dv
  on dv.vendedor_key = f.vendedor_key
left join analytics.dim_canal dca
  on dca.canal_key = f.canal_key
where df.fecha_key is null
   or de.empresa_key is null
   or dp.producto_key is null
   or (f.cliente_key is not null and dc.cliente_key is null)
   or (f.vendedor_key is not null and dv.vendedor_key is null)
   or (f.canal_key is not null and dca.canal_key is null);

-- ================================================================
-- PRUEBA 4. Integridad de claves de inventario
-- Resultado esperado: 0 filas.
-- ================================================================

select
  f.fact_inventario_key,
  f.fecha_key,
  f.empresa_key,
  f.producto_key,
  f.almacen_key
from analytics.fact_inventario_snapshot f
left join analytics.dim_fecha df
  on df.fecha_key = f.fecha_key
left join analytics.dim_empresa de
  on de.empresa_key = f.empresa_key
left join analytics.dim_producto dp
  on dp.producto_key = f.producto_key
left join analytics.dim_almacen da
  on da.almacen_key = f.almacen_key
where df.fecha_key is null
   or de.empresa_key is null
   or dp.producto_key is null
   or da.almacen_key is null;

-- ================================================================
-- PRUEBA 5. Totales base para comparar con Power BI
-- Guarda estos valores; deben coincidir con las medidas del PBIX
-- sin filtros.
-- ================================================================

select
  round(coalesce(sum(facturacion), 0), 2) as facturacion,
  round(coalesce(sum(venta_neta), 0), 2) as venta_neta,
  round(coalesce(sum(costo_total), 0), 2) as costo_ventas,
  round(coalesce(sum(utilidad_bruta), 0), 2) as utilidad_bruta,
  count(distinct source_venta_id) as ventas_confirmadas,
  round(coalesce(sum(cantidad), 0), 3) as unidades_vendidas,
  count(distinct cliente_key)
    filter (where cliente_key is not null) as clientes_compradores,
  count(distinct producto_key) as productos_vendidos
from analytics.fact_ventas;

-- ================================================================
-- PRUEBA 6. Margen y ticket base para comparar con Power BI
-- ================================================================

with totales as (
  select
    coalesce(sum(facturacion), 0) as facturacion,
    coalesce(sum(venta_neta), 0) as venta_neta,
    coalesce(sum(utilidad_bruta), 0) as utilidad_bruta,
    count(distinct source_venta_id) as ventas
  from analytics.fact_ventas
)
select
  round(
    case when venta_neta = 0 then 0
         else utilidad_bruta / venta_neta * 100
    end,
    2
  ) as margen_bruto_pct,
  round(
    case when ventas = 0 then 0
         else facturacion / ventas
    end,
    2
  ) as ticket_promedio
from totales;

-- ================================================================
-- PRUEBA 7. Último snapshot de inventario
-- Estos valores deben coincidir con las tarjetas de Inventario
-- en Power BI.
-- ================================================================

with ultima_fecha as (
  select max(fecha_key) as fecha_key
  from analytics.fact_inventario_snapshot
)
select
  df.fecha as ultima_fecha,
  round(coalesce(sum(f.stock_actual), 0), 3) as stock_total,
  round(coalesce(sum(f.valor_stock), 0), 2) as valor_inventario,
  count(*) filter (where f.es_critico) as posiciones_criticas,
  count(*) filter (where f.es_agotado) as posiciones_agotadas
from analytics.fact_inventario_snapshot f
join ultima_fecha uf
  on uf.fecha_key = f.fecha_key
join analytics.dim_fecha df
  on df.fecha_key = f.fecha_key
group by df.fecha;

-- ================================================================
-- PRUEBA 8. No debe haber duplicados en el snapshot
-- Resultado esperado: 0 filas.
-- ================================================================

select
  fecha_key,
  empresa_key,
  producto_key,
  almacen_key,
  count(*) as repeticiones
from analytics.fact_inventario_snapshot
group by
  fecha_key,
  empresa_key,
  producto_key,
  almacen_key
having count(*) > 1;

-- ================================================================
-- PRUEBA 9. Vista de ventas legible
-- Útil para contrastar visualmente los datos de Power BI.
-- ================================================================

select *
from analytics.vw_ventas_analiticas
order by fecha desc, fact_venta_key desc
limit 20;

-- ================================================================
-- PRUEBA 10. Vista de inventario legible
-- ================================================================

select *
from analytics.vw_inventario_analitico
order by fecha desc, producto, almacen
limit 50;
