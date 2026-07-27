-- ComercioBI
-- Verificaciones seguras de la Fase 8.
-- No modifica datos.

-- 1. Las dos funciones públicas de inventario deben existir como SECURITY DEFINER.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'registrar_movimiento_inventario',
    'actualizar_stock_minimo'
  )
order by routine_name;

-- 2. No deben existir existencias con stock negativo.
select
  e.id,
  a.nombre as almacen,
  p.sku,
  p.nombre as producto,
  e.stock_actual,
  e.stock_minimo
from public.existencias_producto e
join public.almacenes a
  on a.id = e.almacen_id
join public.productos p
  on p.id = e.producto_id
where e.stock_actual < 0
   or e.stock_minimo < 0;

-- 3. Cada producto activo debe tener existencia en cada almacén activo de su empresa.
select
  a.empresa_id,
  a.nombre as almacen,
  p.sku,
  p.nombre as producto
from public.almacenes a
join public.productos p
  on p.empresa_id = a.empresa_id
left join public.existencias_producto e
  on e.almacen_id = a.id
 and e.producto_id = p.id
where a.activo = true
  and p.activo = true
  and e.id is null
order by a.nombre, p.nombre;

-- 4. Los movimientos deben respetar su operación aritmética.
select
  mi.id,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.stock_anterior,
  mi.stock_resultante,
  mi.motivo
from public.movimientos_inventario mi
where (
    mi.tipo_movimiento in ('ENTRADA', 'AJUSTE_POSITIVO', 'REVERSA')
    and round(mi.stock_anterior + mi.cantidad, 3)
      <> round(mi.stock_resultante, 3)
  )
  or (
    mi.tipo_movimiento in ('SALIDA', 'AJUSTE_NEGATIVO')
    and round(mi.stock_anterior - mi.cantidad, 3)
      <> round(mi.stock_resultante, 3)
  );

-- 5. El stock actual debe coincidir con el último movimiento de cada existencia.
with ultimo_movimiento as (
  select distinct on (mi.almacen_id, mi.producto_id)
    mi.almacen_id,
    mi.producto_id,
    mi.stock_resultante,
    mi.fecha_movimiento,
    mi.id
  from public.movimientos_inventario mi
  order by
    mi.almacen_id,
    mi.producto_id,
    mi.fecha_movimiento desc,
    mi.id desc
)
select
  a.nombre as almacen,
  p.sku,
  p.nombre as producto,
  e.stock_actual,
  um.stock_resultante as ultimo_stock_registrado,
  um.fecha_movimiento
from public.existencias_producto e
join ultimo_movimiento um
  on um.almacen_id = e.almacen_id
 and um.producto_id = e.producto_id
join public.almacenes a
  on a.id = e.almacen_id
join public.productos p
  on p.id = e.producto_id
where round(e.stock_actual, 3)
   <> round(um.stock_resultante, 3);

-- 6. Resumen operativo por estado de stock.
select
  case
    when e.stock_actual <= 0 then 'AGOTADO'
    when e.stock_minimo > 0
      and e.stock_actual <= e.stock_minimo then 'CRITICO'
    else 'NORMAL'
  end as estado_stock,
  count(*) as productos,
  round(sum(e.stock_actual * p.costo_actual), 2) as valorizacion
from public.existencias_producto e
join public.productos p
  on p.id = e.producto_id
join public.almacenes a
  on a.id = e.almacen_id
where p.activo = true
  and a.activo = true
group by 1
order by 1;

-- 7. Kardex resumido por tipo de movimiento.
select
  mi.tipo_movimiento,
  count(*) as movimientos,
  round(sum(mi.cantidad), 3) as cantidad_total
from public.movimientos_inventario mi
group by mi.tipo_movimiento
order by mi.tipo_movimiento;

-- 8. Últimos 30 movimientos para revisión visual.
select
  mi.fecha_movimiento,
  a.nombre as almacen,
  p.sku,
  p.nombre as producto,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.stock_anterior,
  mi.stock_resultante,
  mi.motivo
from public.movimientos_inventario mi
join public.almacenes a
  on a.id = mi.almacen_id
join public.productos p
  on p.id = mi.producto_id
order by mi.fecha_movimiento desc, mi.id desc
limit 30;
