-- ============================================================
-- ComercioBI
-- Fase 15 - Administración de usuarios y roles
-- Migración 023
--
-- Objetivos:
--   1. Permitir que un ADMIN liste miembros de su empresa,
--      incluidos los inactivos, junto con el correo de Auth.
--   2. Proteger a cada empresa para que nunca se quede sin
--      al menos un ADMIN activo.
--   3. Mantener RLS y privilegios existentes: esta migración
--      NO expone auth.users ni concede permisos directos.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Listado administrativo de miembros.
--
-- La función es SECURITY DEFINER porque necesita leer auth.users
-- para mostrar el correo. Antes de devolver cualquier fila valida
-- que quien ejecuta la función sea ADMIN activo de la empresa.
-- ------------------------------------------------------------

create or replace function public.listar_usuarios_empresa_admin(
    p_empresa_id uuid
)
returns table (
    membership_id uuid,
    perfil_id uuid,
    email text,
    nombres varchar,
    apellidos varchar,
    rol public.rol_empresa_enum,
    membresia_activa boolean,
    perfil_activo boolean,
    creado_at timestamptz,
    actualizado_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not public.tiene_rol(
        p_empresa_id,
        array['ADMIN']::public.rol_empresa_enum[]
    ) then
        raise exception using
            errcode = '42501',
            message = 'Solo un administrador activo puede consultar los usuarios de la empresa.';
    end if;

    return query
    select
        ue.id as membership_id,
        p.id as perfil_id,
        u.email::text as email,
        p.nombres,
        p.apellidos,
        ue.rol,
        ue.activo as membresia_activa,
        p.activo as perfil_activo,
        ue.creado_at,
        ue.actualizado_at
    from public.usuarios_empresa ue
    join public.perfiles p
      on p.id = ue.perfil_id
    join auth.users u
      on u.id = p.id
    where ue.empresa_id = p_empresa_id
    order by
        ue.activo desc,
        case ue.rol
            when 'ADMIN' then 1
            when 'GERENTE' then 2
            when 'ANALISTA' then 3
            when 'VENDEDOR' then 4
            when 'ALMACEN' then 5
            else 99
        end,
        p.apellidos,
        p.nombres,
        u.email;
end;
$$;

revoke all on function public.listar_usuarios_empresa_admin(uuid)
from public, anon;

grant execute on function public.listar_usuarios_empresa_admin(uuid)
to authenticated;

-- ------------------------------------------------------------
-- 2. Protección del último administrador activo.
--
-- Evita que un UPDATE o DELETE deje a una empresa sin un ADMIN
-- activo y con perfil activo. La regla se aplica incluso si la
-- operación se intenta fuera de la interfaz React.
-- ------------------------------------------------------------

create or replace function public.proteger_ultimo_admin_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_quita_admin_activo boolean := false;
    v_admins_restantes integer;
begin
    if tg_op = 'DELETE' then
        v_quita_admin_activo := (
            old.rol = 'ADMIN'
            and old.activo = true
        );
    elsif tg_op = 'UPDATE' then
        v_quita_admin_activo := (
            old.rol = 'ADMIN'
            and old.activo = true
            and (
                new.rol <> 'ADMIN'
                or new.activo = false
            )
        );
    end if;

    if v_quita_admin_activo then
        select count(*)::integer
        into v_admins_restantes
        from public.usuarios_empresa ue
        join public.perfiles p
          on p.id = ue.perfil_id
        where ue.empresa_id = old.empresa_id
          and ue.id <> old.id
          and ue.rol = 'ADMIN'
          and ue.activo = true
          and p.activo = true;

        if v_admins_restantes = 0 then
            raise exception using
                errcode = 'P0001',
                message = 'No se puede desactivar ni cambiar el rol del último administrador activo de la empresa.';
        end if;
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;

    return new;
end;
$$;

revoke all on function public.proteger_ultimo_admin_empresa()
from public, anon, authenticated;

-- La función se invoca únicamente mediante el trigger.

drop trigger if exists trg_proteger_ultimo_admin_empresa
on public.usuarios_empresa;

create trigger trg_proteger_ultimo_admin_empresa
before update of rol, activo or delete
on public.usuarios_empresa
for each row
execute function public.proteger_ultimo_admin_empresa();

commit;
