-- ComercioBI
-- Pruebas manuales de RLS.
-- Reemplaza REEMPLAZAR_UUID_ADMIN y REEMPLAZAR_UUID_VENDEDOR
-- por los UUID mostrados en Authentication > Users.
--
-- Ejecuta cada bloque por separado.
-- Los cambios exitosos se revierten con ROLLBACK.

-- ============================================================
-- PRUEBA A: el ADMIN puede leer la empresa y los ocho productos.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"REEMPLAZAR_UUID_ADMIN","role":"authenticated"}',
  true
);

select auth.uid() as usuario_simulado;

select count(*) as empresas_visibles
from public.empresas;

select count(*) as productos_visibles
from public.productos;

rollback;


-- ============================================================
-- PRUEBA B: el ADMIN puede modificar un producto.
-- Debe devolver UPDATE 1. El ROLLBACK deshace la prueba.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"REEMPLAZAR_UUID_ADMIN","role":"authenticated"}',
  true
);

update public.productos
set descripcion = descripcion
where id = '50000000-0000-0000-0000-000000000001';

rollback;


-- ============================================================
-- PRUEBA C: el VENDEDOR puede leer productos.
-- Debe mostrar 8 productos visibles.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"REEMPLAZAR_UUID_VENDEDOR","role":"authenticated"}',
  true
);

select auth.uid() as usuario_simulado;

select count(*) as productos_visibles
from public.productos;

rollback;


-- ============================================================
-- PRUEBA D: el VENDEDOR NO puede modificar productos.
-- Debe mostrar un error de política RLS.
-- Después del error, ejecuta ROLLBACK en otra ejecución.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"REEMPLAZAR_UUID_VENDEDOR","role":"authenticated"}',
  true
);

update public.productos
set descripcion = descripcion
where id = '50000000-0000-0000-0000-000000000001';

-- Si aparece el error esperado, ejecuta después:
-- rollback;


-- ============================================================
-- PRUEBA E: el VENDEDOR puede registrar un cliente.
-- Debe devolver INSERT 0 1. El ROLLBACK evita guardar la prueba.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"REEMPLAZAR_UUID_VENDEDOR","role":"authenticated"}',
  true
);

insert into public.clientes (
  empresa_id,
  tipo_cliente,
  nombre_completo,
  segmento
)
values (
  '00000000-0000-0000-0000-000000000001',
  'PERSONA',
  'Cliente temporal RLS',
  'MINORISTA'
);

rollback;


-- ============================================================
-- PRUEBA F: un usuario sin membresía no ve datos empresariales.
-- Debe mostrar 0 empresas y 0 productos.
-- ============================================================
begin;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff","role":"authenticated"}',
  true
);

select count(*) as empresas_visibles
from public.empresas;

select count(*) as productos_visibles
from public.productos;

rollback;
