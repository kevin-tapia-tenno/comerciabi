-- ComercioBI
-- Verificaciones seguras de la Fase 10.
-- No modifica datos.

-- 1. Bucket privado, 5 MB y tres MIME permitidos.
select
  id,
  public,
  file_size_limit,
  cardinality(allowed_mime_types) as cantidad_mime,
  allowed_mime_types
from storage.buckets
where id = 'archivos-carga';

-- Esperado:
-- public = false
-- file_size_limit = 5242880
-- cantidad_mime = 3

-- 2. RLS activo en tablas de auditoría.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('cargas_archivo', 'errores_carga')
order by tablename;

-- 3. Políticas de tablas públicas.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('cargas_archivo', 'errores_carga')
order by tablename, policyname;

-- 4. Políticas del bucket.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'archivos_carga_insert_analista',
    'archivos_carga_select_miembros',
    'archivos_carga_delete_propietario'
  )
order by policyname;

-- 5. Funciones auxiliares requeridas.
select routine_name, security_type, data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'puede_editar_carga',
    'puede_ver_carga',
    'tiene_rol',
    'es_miembro_empresa'
  )
order by routine_name;

-- 6. Últimas cargas y sus contadores.
select
  id,
  modulo,
  nombre_archivo,
  estado,
  total_filas,
  filas_validas,
  filas_invalidas,
  filas_insertadas,
  creado_at,
  finalizado_at
from public.cargas_archivo
order by creado_at desc
limit 20;

-- 7. Errores asociados a las últimas cargas.
select
  c.nombre_archivo,
  c.modulo,
  e.numero_fila,
  e.campo,
  e.codigo_error,
  e.mensaje_error
from public.errores_carga e
join public.cargas_archivo c
  on c.id = e.carga_archivo_id
order by e.creado_at desc
limit 50;
