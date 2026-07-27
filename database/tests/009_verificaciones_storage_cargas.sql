-- ComercioBI
-- Verificaciones de la corrección de Storage RLS de la Fase 10.
-- Este archivo solo consulta; no modifica datos.

-- 1. Demostración de la causa del error.
select
  '00000000-0000-0000-0000-000000000001'::uuid as empresa_demo,
  '00000000-0000-0000-0000-000000000001'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    as aceptaba_patron_anterior,
  '00000000-0000-0000-0000-000000000001'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    as acepta_patron_corregido;

-- Resultado esperado:
-- aceptaba_patron_anterior = false
-- acepta_patron_corregido = true

-- 2. Configuración del bucket.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'archivos-carga';

-- 3. Las tres políticas deben existir.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'archivos_carga_insert_analista',
    'archivos_carga_select_miembros',
    'archivos_carga_delete_propietario'
  )
order by policyname;

-- 4. Comprobar cómo Storage separa la ruta que genera React.
select
  storage.foldername(
    '00000000-0000-0000-0000-000000000001/11111111-1111-4111-8111-111111111111/archivo.xlsx'
  ) as carpetas;

-- Resultado esperado:
-- {00000000-0000-0000-0000-000000000001,11111111-1111-4111-8111-111111111111}
