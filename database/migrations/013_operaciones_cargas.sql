-- ComercioBI
-- Migración 013: operaciones y seguridad para cargas masivas
-- Ejecutar después de:
--   012_corregir_eliminacion_borrador_compra.sql

begin;

-- =========================================================
-- 1. POLÍTICAS DE SUPABASE STORAGE
-- =========================================================
-- Estructura esperada de las rutas:
--
-- empresa_id/auth_uid/identificador-nombre_archivo.xlsx
--
-- Ejemplo:
-- 00000000-0000-0000-0000-000000000001/
-- c47d1ded-e8b0-45c7-9f07-ca1c9820ded3/
-- 7b89d5c1-clientes-julio.xlsx
--
-- No se concede UPDATE ni DELETE desde el navegador.
-- Los archivos originales se conservan como evidencia de auditoría.

drop policy if exists "archivos_carga_insert_analista"
on storage.objects;

drop policy if exists "archivos_carga_select_miembros"
on storage.objects;


-- ADMIN y ANALISTA pueden subir archivos.
-- La primera carpeta debe corresponder a una empresa en la que
-- tengan el rol necesario.
-- La segunda carpeta debe ser el UID del usuario autenticado.

create policy "archivos_carga_insert_analista"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archivos-carga'

  and (storage.foldername(name))[2] = (select auth.uid()::text)

  and public.tiene_rol(
    case
      when (storage.foldername(name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end,
    array[
      'ADMIN'::public.rol_empresa_enum,
      'ANALISTA'::public.rol_empresa_enum
    ]
  )
);


-- Cualquier integrante activo de la empresa puede consultar
-- o descargar sus archivos de carga.

create policy "archivos_carga_select_miembros"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archivos-carga'

  and public.es_miembro_empresa(
    case
      when (storage.foldername(name))[1]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then ((storage.foldername(name))[1])::uuid
      else null
    end
  )
);


-- =========================================================
-- 2. INICIAR UNA CARGA
-- =========================================================

create or replace function public.iniciar_carga_archivo(
  p_empresa_id uuid,
  p_modulo public.modulo_carga_enum,
  p_nombre_archivo text,
  p_ruta_archivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_empresa_id uuid;
  v_carga_archivo_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Debes iniciar sesión para registrar una carga de archivo.';
  end if;

  if p_empresa_id is null then
    raise exception
      'La empresa es obligatoria.';
  end if;

  if p_modulo is null then
    raise exception
      'El módulo de la carga es obligatorio.';
  end if;

  if nullif(pg_catalog.btrim(p_nombre_archivo), '') is null then
    raise exception
      'El nombre del archivo es obligatorio.';
  end if;

  if nullif(pg_catalog.btrim(p_ruta_archivo), '') is null then
    raise exception
      'La ruta del archivo es obligatoria.';
  end if;

  if not public.tiene_rol(
    p_empresa_id,
    array[
      'ADMIN'::public.rol_empresa_enum,
      'ANALISTA'::public.rol_empresa_enum
    ]
  ) then
    raise exception
      'Tu rol no permite realizar cargas masivas.';
  end if;

  select ue.id
  into v_usuario_empresa_id
  from public.usuarios_empresa ue
  where ue.empresa_id = p_empresa_id
    and ue.perfil_id = auth.uid()
    and ue.activo = true
  order by ue.creado_at
  limit 1;

  if v_usuario_empresa_id is null then
    raise exception
      'No se encontró una membresía activa para el usuario y la empresa.';
  end if;

  insert into public.cargas_archivo (
    empresa_id,
    usuario_empresa_id,
    modulo,
    nombre_archivo,
    ruta_archivo
  )
  values (
    p_empresa_id,
    v_usuario_empresa_id,
    p_modulo,
    pg_catalog.btrim(p_nombre_archivo),
    pg_catalog.btrim(p_ruta_archivo)
  )
  returning id
  into v_carga_archivo_id;

  return v_carga_archivo_id;
end;
$$;


-- =========================================================
-- 3. REGISTRAR ERRORES EN BLOQUE
-- =========================================================
-- p_errores debe ser un arreglo JSON como:
--
-- [
--   {
--     "numero_fila": 3,
--     "campo": "correo",
--     "valor_original": "correo-invalido",
--     "codigo_error": "FORMATO_INVALIDO",
--     "mensaje_error": "El correo electrónico no es válido."
--   }
-- ]

create or replace function public.registrar_errores_carga(
  p_carga_archivo_id uuid,
  p_errores jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_insertado integer := 0;
begin
  if auth.uid() is null then
    raise exception
      'Debes iniciar sesión para registrar errores de carga.';
  end if;

  if p_carga_archivo_id is null then
    raise exception
      'La carga de archivo es obligatoria.';
  end if;

  if not public.puede_editar_carga(p_carga_archivo_id) then
    raise exception
      'Tu rol no permite modificar esta carga.';
  end if;

  if p_errores is null then
    return 0;
  end if;

  if pg_catalog.jsonb_typeof(p_errores) <> 'array' then
    raise exception
      'Los errores deben enviarse como un arreglo JSON.';
  end if;

  if pg_catalog.jsonb_array_length(p_errores) = 0 then
    return 0;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_errores) as error_validacion (
      numero_fila integer,
      campo text,
      valor_original text,
      codigo_error text,
      mensaje_error text
    )
    where error_validacion.numero_fila is null
       or error_validacion.numero_fila < 1
       or nullif(
            pg_catalog.btrim(error_validacion.mensaje_error),
            ''
          ) is null
  ) then
    raise exception
      'Todos los errores deben tener un número de fila válido y un mensaje.';
  end if;

  insert into public.errores_carga (
    carga_archivo_id,
    numero_fila,
    campo,
    valor_original,
    codigo_error,
    mensaje_error
  )
  select
    p_carga_archivo_id,
    error_fila.numero_fila,
    nullif(pg_catalog.btrim(error_fila.campo), ''),
    nullif(error_fila.valor_original, ''),
    nullif(pg_catalog.btrim(error_fila.codigo_error), ''),
    pg_catalog.btrim(error_fila.mensaje_error)
  from pg_catalog.jsonb_to_recordset(p_errores) as error_fila (
    numero_fila integer,
    campo text,
    valor_original text,
    codigo_error text,
    mensaje_error text
  );

  get diagnostics v_total_insertado = row_count;

  return v_total_insertado;
end;
$$;


-- =========================================================
-- 4. FINALIZAR UNA CARGA
-- =========================================================

create or replace function public.finalizar_carga_archivo(
  p_carga_archivo_id uuid,
  p_estado public.estado_carga_enum,
  p_total_filas integer,
  p_filas_validas integer,
  p_filas_invalidas integer,
  p_filas_insertadas integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception
      'Debes iniciar sesión para finalizar una carga.';
  end if;

  if p_carga_archivo_id is null then
    raise exception
      'La carga de archivo es obligatoria.';
  end if;

  if not public.puede_editar_carga(p_carga_archivo_id) then
    raise exception
      'Tu rol no permite finalizar esta carga.';
  end if;

  if p_estado is null then
    raise exception
      'El estado final de la carga es obligatorio.';
  end if;

  if p_total_filas < 0
     or p_filas_validas < 0
     or p_filas_invalidas < 0
     or p_filas_insertadas < 0 then
    raise exception
      'Los contadores de la carga no pueden ser negativos.';
  end if;

  if p_filas_validas + p_filas_invalidas <> p_total_filas then
    raise exception
      'La suma de filas válidas e inválidas debe coincidir con el total.';
  end if;

  if p_filas_insertadas > p_filas_validas then
    raise exception
      'Las filas insertadas no pueden superar las filas válidas.';
  end if;

  update public.cargas_archivo
  set
    estado = p_estado,
    total_filas = p_total_filas,
    filas_validas = p_filas_validas,
    filas_invalidas = p_filas_invalidas,
    filas_insertadas = p_filas_insertadas,
    finalizado_at = pg_catalog.now()
  where id = p_carga_archivo_id;

  if not found then
    raise exception
      'No se encontró la carga solicitada.';
  end if;
end;
$$;


-- =========================================================
-- 5. PERMISOS DE EJECUCIÓN
-- =========================================================

revoke execute
on function public.iniciar_carga_archivo(
  uuid,
  public.modulo_carga_enum,
  text,
  text
)
from public, anon;

revoke execute
on function public.registrar_errores_carga(
  uuid,
  jsonb
)
from public, anon;

revoke execute
on function public.finalizar_carga_archivo(
  uuid,
  public.estado_carga_enum,
  integer,
  integer,
  integer,
  integer
)
from public, anon;


grant execute
on function public.iniciar_carga_archivo(
  uuid,
  public.modulo_carga_enum,
  text,
  text
)
to authenticated;

grant execute
on function public.registrar_errores_carga(
  uuid,
  jsonb
)
to authenticated;

grant execute
on function public.finalizar_carga_archivo(
  uuid,
  public.estado_carga_enum,
  integer,
  integer,
  integer,
  integer
)
to authenticated;


comment on function public.iniciar_carga_archivo(
  uuid,
  public.modulo_carga_enum,
  text,
  text
)
is 'Registra el encabezado y trazabilidad inicial de una carga masiva.';

comment on function public.registrar_errores_carga(
  uuid,
  jsonb
)
is 'Registra en bloque los errores encontrados al validar una carga masiva.';

comment on function public.finalizar_carga_archivo(
  uuid,
  public.estado_carga_enum,
  integer,
  integer,
  integer,
  integer
)
is 'Finaliza una carga masiva y actualiza sus contadores de procesamiento.';

commit;