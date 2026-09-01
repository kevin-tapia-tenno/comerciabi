-- ============================================================
-- ComercioBI
-- Fase 14.14B - API FastAPI
-- Migración 022
--
-- Hardening:
--   - Rol de solo lectura para serving.
--   - La API NO recibe SELECT directo sobre perfiles/membresías.
--   - El contexto multiempresa se obtiene mediante una función
--     SECURITY DEFINER de lectura controlada.
-- ============================================================

begin;

do $$
begin
    if not exists (
        select 1
        from pg_roles
        where rolname = 'comerciabi_api_reader'
    ) then
        create role comerciabi_api_reader nologin;
    end if;
end
$$;

grant connect on database postgres to comerciabi_api_reader;
grant usage on schema analytics to comerciabi_api_reader;

-- ------------------------------------------------------------
-- Contexto de usuario.
-- Ejecuta con los permisos del propietario de la función y evita
-- depender de auth.uid() en una conexión PostgreSQL externa.
-- ------------------------------------------------------------

create or replace function analytics.api_usuario_contexto(
    p_perfil_id uuid
)
returns table (
    perfil_id uuid,
    nombres varchar,
    apellidos varchar,
    perfil_activo boolean,
    membership_id uuid,
    empresa_id uuid,
    empresa_key bigint,
    empresa varchar,
    rol text,
    empresa_activa boolean,
    membresia_activa boolean
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        p.id as perfil_id,
        p.nombres,
        p.apellidos,
        p.activo as perfil_activo,
        ue.id as membership_id,
        ue.empresa_id,
        de.empresa_key,
        e.nombre as empresa,
        ue.rol::text as rol,
        e.activo as empresa_activa,
        ue.activo as membresia_activa
    from public.perfiles p
    left join public.usuarios_empresa ue
      on ue.perfil_id = p.id
     and ue.activo = true
    left join public.empresas e
      on e.id = ue.empresa_id
     and e.activo = true
    left join analytics.dim_empresa de
      on de.source_empresa_id = ue.empresa_id
    where p.id = p_perfil_id
      and p.activo = true
    order by e.nombre nulls last, ue.id;
$$;

revoke all on function analytics.api_usuario_contexto(uuid) from public;
grant execute on function analytics.api_usuario_contexto(uuid)
    to comerciabi_api_reader;

-- ------------------------------------------------------------
-- Serving layer IA.
-- ------------------------------------------------------------

grant select on analytics.vw_ai_resumen_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_insights_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_insights_resumen_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_pronostico_ventas_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_pronostico_demanda_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_recomendacion_inventario_actual
    to comerciabi_api_reader;

grant select on analytics.vw_ai_ultima_ejecucion
    to comerciabi_api_reader;

commit;

-- ============================================================
-- PASO MANUAL - NO GUARDAR PASSWORD EN GIT
--
-- Genera una contraseña fuerte y ejecuta una sola vez:
--
-- create role comerciabi_api
-- with login password '<PASSWORD_FUERTE>';
--
-- grant comerciabi_api_reader to comerciabi_api;
--
-- Pooler:
-- API_DB_USER=comerciabi_api.<PROJECT_REF>
-- API_DB_PORT=6543
-- ============================================================
