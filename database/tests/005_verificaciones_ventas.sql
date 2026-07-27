-- ComercioBI
-- Verificaciones seguras de la Fase 7.
-- Todas las consultas son de solo lectura.

-- 1. Funciones transaccionales disponibles.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'guardar_venta_borrador',
    'confirmar_venta',
    'anular_venta'
  )
order by routine_name;

-- 2. Resumen de ventas por estado.
select
  estado,
  count(*) as cantidad,
  round(sum(total), 2) as importe_total
from public.ventas
where empresa_id = '00000000-0000-0000-0000-000000000001'
group by estado
order by estado;

-- 3. Ventas con cantidad de productos y totales.
select
  v.codigo,
  v.fecha_venta,
  c.nombre_completo as cliente,
  v.estado,
  count(d.id) as lineas,
  v.subtotal,
  v.descuento_total,
  v.impuesto_total,
  v.total
from public.ventas v
join public.clientes c
  on c.id = v.cliente_id
left join public.detalle_venta d
  on d.venta_id = v.id
where v.empresa_id = '00000000-0000-0000-0000-000000000001'
group by v.id, c.nombre_completo
order by v.fecha_venta desc;

-- 4. Diferencias entre el encabezado y el cálculo de los detalles.
-- Resultado esperado: 0 filas.
with calculo as (
  select
    v.id,
    coalesce(sum(d.subtotal_linea), 0)::numeric(14,2) as subtotal_calculado,
    coalesce(sum(d.descuento_linea), 0)::numeric(14,2) as descuento_calculado,
    round(
      coalesce(sum(d.total_linea), 0) * v.tasa_impuesto,
      2
    )::numeric(14,2) as impuesto_calculado,
    round(
      coalesce(sum(d.total_linea), 0)
      + coalesce(sum(d.total_linea), 0) * v.tasa_impuesto,
      2
    )::numeric(14,2) as total_calculado
  from public.ventas v
  left join public.detalle_venta d
    on d.venta_id = v.id
  group by v.id
)
select
  v.codigo,
  v.subtotal,
  c.subtotal_calculado,
  v.descuento_total,
  c.descuento_calculado,
  v.impuesto_total,
  c.impuesto_calculado,
  v.total,
  c.total_calculado
from public.ventas v
join calculo c
  on c.id = v.id
where v.subtotal <> c.subtotal_calculado
   or v.descuento_total <> c.descuento_calculado
   or v.impuesto_total <> c.impuesto_calculado
   or v.total <> c.total_calculado;

-- 5. Ventas confirmadas sin detalle.
-- Resultado esperado: 0 filas.
select v.id, v.codigo
from public.ventas v
where v.estado = 'CONFIRMADA'
  and not exists (
    select 1
    from public.detalle_venta d
    where d.venta_id = v.id
  );

-- 6. Existencias negativas.
-- Resultado esperado: 0 filas.
select
  e.id,
  p.sku,
  p.nombre,
  e.stock_actual
from public.existencias_producto e
join public.productos p
  on p.id = e.producto_id
where e.stock_actual < 0;

-- 7. Códigos de venta duplicados dentro de la empresa.
-- Resultado esperado: 0 filas.
select
  empresa_id,
  codigo,
  count(*) as repeticiones
from public.ventas
group by empresa_id, codigo
having count(*) > 1;

-- 8. Movimientos creados por ventas confirmadas o anuladas.
select
  v.codigo,
  p.sku,
  p.nombre,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.stock_anterior,
  mi.stock_resultante,
  mi.fecha_movimiento
from public.movimientos_inventario mi
join public.ventas v
  on v.id = mi.venta_id
join public.productos p
  on p.id = mi.producto_id
order by mi.fecha_movimiento desc;

-- 9. Stock actual para las pruebas de venta.
select
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
where a.empresa_id = '00000000-0000-0000-0000-000000000001'
order by p.nombre;
