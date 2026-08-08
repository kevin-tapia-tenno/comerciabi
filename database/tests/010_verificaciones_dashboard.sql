-- ComercioBI
-- Verificaciones seguras de la Fase 11: dashboard web.
-- No modifica datos.

-- 1. La función del dashboard debe existir y ser SECURITY DEFINER.
select
  routine_name,
  security_type,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'obtener_dashboard_comercial';

-- Esperado:
-- routine_name = obtener_dashboard_comercial
-- security_type = DEFINER
-- data_type = jsonb


-- 2. authenticated debe tener permiso de ejecución.
select
  routine_schema,
  routine_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'obtener_dashboard_comercial'
  and grantee = 'authenticated';

-- Esperado: una fila con privilege_type = EXECUTE.


-- 3. No deben existir ventas confirmadas sin detalle.
select
  v.id,
  v.codigo,
  v.fecha_venta
from public.ventas v
where v.estado = 'CONFIRMADA'
  and not exists (
    select 1
    from public.detalle_venta d
    where d.venta_id = v.id
  );

-- Esperado: 0 filas.


-- 4. Los costos históricos usados para utilidad deben ser válidos.
select
  d.id,
  v.codigo,
  p.sku,
  d.cantidad,
  d.costo_unitario
from public.detalle_venta d
join public.ventas v
  on v.id = d.venta_id
join public.productos p
  on p.id = d.producto_id
where d.cantidad <= 0
   or d.costo_unitario < 0;

-- Esperado: 0 filas.


-- 5. No deben existir existencias negativas.
select
  e.id,
  p.sku,
  p.nombre,
  e.stock_actual
from public.existencias_producto e
join public.productos p
  on p.id = e.producto_id
where e.stock_actual < 0;

-- Esperado: 0 filas.


-- 6. Resumen de ventas confirmadas por empresa para contrastar el dashboard.
select
  e.nombre as empresa,
  count(v.id)::integer as ventas_confirmadas,
  coalesce(sum(v.total), 0)::numeric(14,2) as facturacion_total,
  min(v.fecha_venta) as primera_venta,
  max(v.fecha_venta) as ultima_venta
from public.empresas e
left join public.ventas v
  on v.empresa_id = e.id
 and v.estado = 'CONFIRMADA'
group by e.id, e.nombre
order by e.nombre;


-- 7. Utilidad histórica de ventas confirmadas por empresa.
select
  e.nombre as empresa,
  coalesce(sum(d.total_linea), 0)::numeric(14,2) as ventas_netas,
  coalesce(
    sum(
      d.total_linea
      - round(d.cantidad * d.costo_unitario, 2)
    ),
    0
  )::numeric(14,2) as utilidad_bruta
from public.empresas e
left join public.ventas v
  on v.empresa_id = e.id
 and v.estado = 'CONFIRMADA'
left join public.detalle_venta d
  on d.venta_id = v.id
group by e.id, e.nombre
order by e.nombre;


-- 8. Stock crítico actual para contrastar la tabla del dashboard.
select
  emp.nombre as empresa,
  a.nombre as almacen,
  p.sku,
  p.nombre as producto,
  e.stock_actual,
  e.stock_minimo
from public.existencias_producto e
join public.productos p
  on p.id = e.producto_id
join public.almacenes a
  on a.id = e.almacen_id
join public.empresas emp
  on emp.id = p.empresa_id
where e.stock_minimo > 0
  and e.stock_actual <= e.stock_minimo
order by emp.nombre, e.stock_actual, p.nombre;
