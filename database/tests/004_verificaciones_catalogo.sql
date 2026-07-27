-- ComercioBI
-- Verificaciones seguras de la Fase 6.
-- No modifica datos.

-- 1. Resumen de clientes por estado y tipo.
select
  tipo_cliente,
  activo,
  count(*) as cantidad
from public.clientes
where empresa_id = '00000000-0000-0000-0000-000000000001'
group by tipo_cliente, activo
order by tipo_cliente, activo desc;

-- 2. Resumen de productos por estado.
select
  activo,
  count(*) as cantidad
from public.productos
where empresa_id = '00000000-0000-0000-0000-000000000001'
group by activo
order by activo desc;

-- 3. Productos con su categoría.
select
  p.sku,
  p.nombre as producto,
  c.nombre as categoria,
  p.unidad_medida,
  p.costo_actual,
  p.precio_venta,
  p.activo
from public.productos p
join public.categorias c
  on c.id = p.categoria_id
 and c.empresa_id = p.empresa_id
where p.empresa_id = '00000000-0000-0000-0000-000000000001'
order by p.nombre;

-- 4. Comprobar que no existan SKU duplicados dentro de la empresa.
select
  empresa_id,
  sku,
  count(*) as repeticiones
from public.productos
group by empresa_id, sku
having count(*) > 1;

-- 5. Comprobar que no existan documentos de cliente duplicados.
select
  empresa_id,
  tipo_documento,
  numero_documento,
  count(*) as repeticiones
from public.clientes
where tipo_documento is not null
  and numero_documento is not null
group by empresa_id, tipo_documento, numero_documento
having count(*) > 1;
