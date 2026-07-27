-- ComercioBI
-- Fase 10 - Corrección de políticas RLS de Supabase Storage.
-- Ejecutar después de 014_ajustes_finales_cargas.sql.
--
-- Motivo:
-- La empresa demo usa el UUID fijo 00000000-0000-0000-0000-000000000001.
-- La expresión regular anterior exigía una versión RFC entre 1 y 5 y una
-- variante específica, por lo que rechazaba ese UUID aunque PostgreSQL sí lo
-- reconoce como uuid válido. El resultado era:
-- "new row violates row-level security policy" al subir el archivo.

begin;

-- Patrón UUID estructural: acepta cualquier UUID que PostgreSQL pueda usar en
-- este proyecto, incluido el identificador fijo de la empresa demo.
-- Se conserva la validación previa antes de convertir el texto a uuid.

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
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.tiene_rol(
    ((storage.foldername(name))[1])::uuid,
    array['ADMIN', 'ANALISTA']::public.rol_empresa_enum[]
  )
);

-- Supabase Storage necesita que el objeto recién insertado también pueda ser
-- leído por la consulta RETURNING del upload. Por eso SELECT debe autorizar la
-- misma empresa y ruta.
create policy archivos_carga_select_miembros
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archivos-carga'
  and array_length(storage.foldername(name), 1) >= 1
  and (storage.foldername(name))[1]
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.puede_editar_carga(
    ((storage.foldername(name))[2])::uuid
  )
);

commit;

notify pgrst, 'reload schema';
