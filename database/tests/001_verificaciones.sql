-- ComercioBI
-- Verificaciones seguras de la Fase 3
-- No modifica datos.

-- 1. Deben existir 14 tablas del proyecto en public.
select
  count(*) as total_tablas_comerciabi
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
  and table_name in (
    'empresas',
    'perfiles',
    'usuarios_empresa',
    'clientes',
    'categorias',
    'productos',
    'almacenes',
    'existencias_producto',
    'canales_venta',
    'ventas',
    'detalle_venta',
    'movimientos_inventario',
    'cargas_archivo',
    'errores_carga'
  );

-- Resultado esperado: 14.


-- 2. Lista de tablas y estado de RLS.
select
  c.relname as tabla,
  c.relrowsecurity as rls_habilitado
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'empresas',
    'perfiles',
    'usuarios_empresa',
    'clientes',
    'categorias',
    'productos',
    'almacenes',
    'existencias_producto',
    'canales_venta',
    'ventas',
    'detalle_venta',
    'movimientos_inventario',
    'cargas_archivo',
    'errores_carga'
  )
order by c.relname;

-- Resultado esperado: las 14 filas con rls_habilitado = true.


-- 3. Tipos enumerados creados.
select
  t.typname as tipo,
  e.enumsortorder as orden,
  e.enumlabel as valor
from pg_catalog.pg_type t
join pg_catalog.pg_enum e
  on t.oid = e.enumtypid
join pg_catalog.pg_namespace n
  on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typname in (
    'rol_empresa_enum',
    'tipo_cliente_enum',
    'tipo_documento_enum',
    'segmento_cliente_enum',
    'unidad_medida_enum',
    'estado_venta_enum',
    'tipo_movimiento_enum',
    'modulo_carga_enum',
    'estado_carga_enum'
  )
order by t.typname, e.enumsortorder;


-- 4. Cantidad de datos iniciales.
select 'empresas' as entidad, count(*) as cantidad
from public.empresas
union all
select 'categorias', count(*)
from public.categorias
union all
select 'almacenes', count(*)
from public.almacenes
union all
select 'canales_venta', count(*)
from public.canales_venta
union all
select 'clientes', count(*)
from public.clientes
union all
select 'productos', count(*)
from public.productos
union all
select 'existencias_producto', count(*)
from public.existencias_producto
order by entidad;


-- 5. Catálogo de productos con categoría y stock.
select
  p.sku,
  p.nombre as producto,
  c.nombre as categoria,
  p.costo_actual,
  p.precio_venta,
  e.stock_actual,
  e.stock_minimo,
  a.nombre as almacen
from public.productos p
join public.categorias c
  on c.id = p.categoria_id
join public.existencias_producto e
  on e.producto_id = p.id
join public.almacenes a
  on a.id = e.almacen_id
order by p.sku;


-- 6. Triggers creados por el proyecto.
select
  event_object_table as tabla,
  trigger_name
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;


-- 7. Índices creados en las tablas del proyecto.
select
  tablename as tabla,
  indexname as indice
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'empresas',
    'perfiles',
    'usuarios_empresa',
    'clientes',
    'categorias',
    'productos',
    'almacenes',
    'existencias_producto',
    'canales_venta',
    'ventas',
    'detalle_venta',
    'movimientos_inventario',
    'cargas_archivo',
    'errores_carga'
  )
order by tablename, indexname;
