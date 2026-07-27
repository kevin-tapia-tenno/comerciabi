-- ComercioBI
-- Fase 10 - Ajustes finales del módulo de cargas de archivos.
-- Ejecutar después de 013_operaciones_cargas.sql.

begin;

-- 1. Configuración segura del bucket privado.
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]::text[]
where id = 'archivos-carga';

-- 2. Políticas idempotentes de Storage.
drop policy if exists archivos_carga_insert_analista on storage.objects;
drop policy if exists archivos_carga_select_miembros on storage.objects;
drop policy if exists archivos_carga_delete_propietario on storage.objects;

create policy archivos_carga_insert_analista
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archivos-carga'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1]
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.tiene_rol(
    ((storage.foldername(name))[1])::uuid,
    array['ADMIN', 'ANALISTA']::public.rol_empresa_enum[]
  )
);

create policy archivos_carga_select_miembros
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archivos-carga'
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1]
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.es_miembro_empresa(
    ((storage.foldername(name))[1])::uuid
  )
);

create policy archivos_carga_delete_propietario
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archivos-carga'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[2]
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.puede_editar_carga(
    ((storage.foldername(name))[2])::uuid
  )
);

-- 3. Índices complementarios para el historial.
create index if not exists idx_cargas_archivo_empresa_fecha
  on public.cargas_archivo (empresa_id, creado_at desc);

create index if not exists idx_errores_carga_carga_fila
  on public.errores_carga (carga_archivo_id, numero_fila);

commit;

notify pgrst, 'reload schema';
