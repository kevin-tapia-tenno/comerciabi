-- ComercioBI
-- Verificaciones de la Fase 12.
-- Ejecutar DESPUÉS de:
--   1) ejecutar 017_modelo_analitico.sql;
--   2) ejecutar al menos una vez el ETL Python.
--
-- Las consultas están diseñadas para inspeccionarse por bloques.

-- ================================================================
-- PRUEBA 1. Objetos del esquema analytics
-- Deben aparecer 9 tablas y 2 vistas principales.
-- ================================================================
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'analytics'
order by table_type, table_name;

-- ================================================================
-- PRUEBA 2. Últimas ejecuciones ETL
-- La ejecución más reciente debe quedar COMPLETADA.
-- ================================================================
select
  id,
  iniciado_en,
  finalizado_en,
  estado,
  filas_ventas,
  filas_inventario,
  mensaje
from analytics.etl_ejecuciones
order by id desc
limit 10;

-- ================================================================
-- PRUEBA 3. Conteo de dimensiones y hechos
-- ================================================================
select 'dim_fecha' as objeto, count(*) as filas
from analytics.dim_fecha
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
-- PRUEBA 4. Cantidad de líneas de ventas: operacional vs analítico
-- Los dos valores deben coincidir.
-- ================================================================
select
  (
    select count(*)
    from public.detalle_venta d
    join public.ventas v
      on v.id = d.venta_id
    where v.estado = 'CONFIRMADA'
  ) as lineas_operacionales_confirmadas,
  (
    select count(*)
    from analytics.fact_ventas
  ) as lineas_analiticas;

-- ================================================================
-- PRUEBA 5. Venta neta y utilidad: operacional vs analítico
-- Las diferencias deben ser 0 o únicamente redondeos mínimos.
-- ================================================================
with operacional as (
  select
    coalesce(sum(d.total_linea), 0)::numeric as venta_neta,
    coalesce(
      sum(
        d.total_linea
        - round(d.cantidad * d.costo_unitario, 2)
      ),
      0
    )::numeric as utilidad_bruta
  from public.detalle_venta d
  join public.ventas v
    on v.id = d.venta_id
  where v.estado = 'CONFIRMADA'
),
analitico as (
  select
    coalesce(sum(venta_neta), 0)::numeric as venta_neta,
    coalesce(sum(utilidad_bruta), 0)::numeric as utilidad_bruta
  from analytics.fact_ventas
)
select
  round(o.venta_neta, 2) as venta_neta_operacional,
  round(a.venta_neta, 2) as venta_neta_analitica,
  round(a.venta_neta - o.venta_neta, 2) as diferencia_venta_neta,
  round(o.utilidad_bruta, 2) as utilidad_operacional,
  round(a.utilidad_bruta, 2) as utilidad_analitica,
  round(a.utilidad_bruta - o.utilidad_bruta, 2) as diferencia_utilidad
from operacional o
cross join analitico a;

-- ================================================================
-- PRUEBA 6. Facturación por venta
-- El total analítico asignado a líneas debe reproducir el total de la venta.
-- No deberían aparecer filas con diferencia mayor a S/ 0.02.
-- ================================================================
with analitico as (
  select
    source_venta_id,
    round(sum(facturacion), 2) as facturacion_analitica
  from analytics.fact_ventas
  group by source_venta_id
)
select
  v.codigo,
  round(v.total, 2) as total_operacional,
  a.facturacion_analitica,
  round(a.facturacion_analitica - v.total, 2) as diferencia
from public.ventas v
join analitico a
  on a.source_venta_id = v.id
where abs(a.facturacion_analitica - v.total) > 0.02
order by abs(a.facturacion_analitica - v.total) desc;

-- ================================================================
-- PRUEBA 7. Duplicados en el snapshot de inventario
-- Debe devolver 0 filas.
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
-- PRUEBA 8. Integridad de claves del hecho de ventas
-- Todos los conteos deben ser 0 salvo cliente/vendedor/canal si el origen
-- permitiera explícitamente valores nulos.
-- ================================================================
select
  count(*) filter (where fecha_key is null) as fecha_sin_dimension,
  count(*) filter (where empresa_key is null) as empresa_sin_dimension,
  count(*) filter (where producto_key is null) as producto_sin_dimension,
  count(*) filter (where cantidad <= 0) as cantidad_invalida,
  count(*) filter (where costo_total < 0) as costo_invalido
from analytics.fact_ventas;

-- ================================================================
-- PRUEBA 9. Muestra de la vista de ventas
-- ================================================================
select *
from analytics.vw_ventas_analiticas
order by fecha desc, fact_venta_key desc
limit 20;

-- ================================================================
-- PRUEBA 10. Muestra de inventario analítico
-- ================================================================
select *
from analytics.vw_inventario_analitico
order by fecha desc, empresa, producto, almacen
limit 20;
