-- ComercioBI
-- Verificaciones seguras de la Fase 9.
-- No modifica datos.

-- 1. Deben existir las tres tablas nuevas.
select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('proveedores', 'compras', 'detalle_compra')
order by table_name;

-- 2. Las tres funciones públicas deben existir como SECURITY DEFINER.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'guardar_compra_borrador',
    'confirmar_compra',
    'anular_compra'
  )
order by routine_name;

-- 3. RLS debe estar activo.
select
  relname as tabla,
  relrowsecurity as rls_activo
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('proveedores', 'compras', 'detalle_compra')
order by relname;

-- 4. No deben existir compras confirmadas sin detalles.
select
  c.id,
  c.codigo
from public.compras c
where c.estado = 'CONFIRMADA'
  and not exists (
    select 1
    from public.detalle_compra d
    where d.compra_id = c.id
  );

-- 5. Los totales del encabezado deben coincidir con los detalles.
with calculado as (
  select
    c.id,
    coalesce(sum(d.subtotal_linea), 0)::numeric(14,2) as subtotal,
    coalesce(sum(d.descuento_linea), 0)::numeric(14,2) as descuento
  from public.compras c
  left join public.detalle_compra d on d.compra_id = c.id
  group by c.id
)
select
  c.codigo,
  c.subtotal,
  x.subtotal as subtotal_calculado,
  c.descuento_total,
  x.descuento as descuento_calculado,
  c.impuesto_total,
  round((x.subtotal - x.descuento) * c.tasa_impuesto, 2) as impuesto_calculado,
  c.total,
  round(
    (x.subtotal - x.descuento)
    + ((x.subtotal - x.descuento) * c.tasa_impuesto),
    2
  ) as total_calculado
from public.compras c
join calculado x on x.id = c.id
where c.subtotal <> x.subtotal
   or c.descuento_total <> x.descuento
   or c.impuesto_total <> round(
     (x.subtotal - x.descuento) * c.tasa_impuesto,
     2
   )
   or c.total <> round(
     (x.subtotal - x.descuento)
     + ((x.subtotal - x.descuento) * c.tasa_impuesto),
     2
   );

-- 6. No debe haber códigos de compra duplicados.
select
  empresa_id,
  codigo,
  count(*) as repeticiones
from public.compras
group by empresa_id, codigo
having count(*) > 1;

-- 7. No debe haber documentos de proveedor duplicados.
select
  empresa_id,
  tipo_documento,
  numero_documento,
  count(*) as repeticiones
from public.proveedores
where tipo_documento is not null
  and numero_documento is not null
group by empresa_id, tipo_documento, numero_documento
having count(*) > 1;

-- 8. Los movimientos asociados a compras deben tener aritmética correcta.
select
  mi.id,
  c.codigo,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.stock_anterior,
  mi.stock_resultante
from public.movimientos_inventario mi
join public.compras c on c.id = mi.compra_id
where (
    mi.tipo_movimiento = 'ENTRADA'
    and mi.stock_resultante <> mi.stock_anterior + mi.cantidad
  )
  or (
    mi.tipo_movimiento = 'REVERSA_COMPRA'
    and mi.stock_resultante <> mi.stock_anterior - mi.cantidad
  );

-- 9. No deben existir existencias con stock negativo.
select
  e.id,
  p.sku,
  p.nombre,
  e.stock_actual
from public.existencias_producto e
join public.productos p on p.id = e.producto_id
where e.stock_actual < 0;

-- 10. Resumen de compras por estado.
select
  estado,
  count(*) as cantidad,
  coalesce(sum(total), 0)::numeric(14,2) as importe
from public.compras
group by estado
order by estado;

-- 11. Últimos movimientos de compra en el Kardex.
select
  mi.fecha_movimiento,
  c.codigo,
  p.sku,
  p.nombre as producto,
  mi.tipo_movimiento,
  mi.cantidad,
  mi.stock_anterior,
  mi.stock_resultante,
  mi.motivo
from public.movimientos_inventario mi
join public.compras c on c.id = mi.compra_id
join public.productos p on p.id = mi.producto_id
order by mi.fecha_movimiento desc, mi.id desc
limit 30;
