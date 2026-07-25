-- ComercioBI
-- Migración 007: funciones auxiliares de autorización
-- Estas funciones son utilizadas por las políticas RLS.

begin;

create or replace function public.usuario_autenticado_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = (select auth.uid())
      and p.activo = true
  );
$$;

create or replace function public.es_miembro_empresa(p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_empresa ue
    join public.perfiles p
      on p.id = ue.perfil_id
    where ue.empresa_id = p_empresa_id
      and ue.perfil_id = (select auth.uid())
      and ue.activo = true
      and p.activo = true
  );
$$;

create or replace function public.tiene_rol(
  p_empresa_id uuid,
  p_roles public.rol_empresa_enum[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_empresa ue
    join public.perfiles p
      on p.id = ue.perfil_id
    where ue.empresa_id = p_empresa_id
      and ue.perfil_id = (select auth.uid())
      and ue.rol = any(p_roles)
      and ue.activo = true
      and p.activo = true
  );
$$;

create or replace function public.mi_membresia_id(p_empresa_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ue.id
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  where ue.empresa_id = p_empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;
$$;

create or replace function public.comparte_empresa(p_otro_perfil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuarios_empresa propia
    join public.usuarios_empresa otra
      on otra.empresa_id = propia.empresa_id
    join public.perfiles p_propia
      on p_propia.id = propia.perfil_id
    join public.perfiles p_otra
      on p_otra.id = otra.perfil_id
    where propia.perfil_id = (select auth.uid())
      and otra.perfil_id = p_otro_perfil_id
      and propia.activo = true
      and otra.activo = true
      and p_propia.activo = true
      and p_otra.activo = true
  );
$$;

create or replace function public.puede_ver_venta(p_venta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ventas v
    join public.usuarios_empresa ue
      on ue.empresa_id = v.empresa_id
    join public.perfiles p
      on p.id = ue.perfil_id
    where v.id = p_venta_id
      and ue.perfil_id = (select auth.uid())
      and ue.activo = true
      and p.activo = true
  );
$$;

create or replace function public.puede_editar_venta_borrador(p_venta_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ventas v
    join public.usuarios_empresa ue
      on ue.empresa_id = v.empresa_id
    join public.perfiles p
      on p.id = ue.perfil_id
    where v.id = p_venta_id
      and v.estado = 'BORRADOR'
      and ue.perfil_id = (select auth.uid())
      and ue.activo = true
      and p.activo = true
      and (
        ue.rol = 'ADMIN'
        or (
          ue.rol = 'VENDEDOR'
          and v.vendedor_empresa_id = ue.id
        )
      )
  );
$$;

create or replace function public.puede_ver_carga(p_carga_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cargas_archivo c
    join public.usuarios_empresa ue
      on ue.empresa_id = c.empresa_id
    join public.perfiles p
      on p.id = ue.perfil_id
    where c.id = p_carga_id
      and ue.perfil_id = (select auth.uid())
      and ue.activo = true
      and p.activo = true
  );
$$;

create or replace function public.puede_editar_carga(p_carga_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cargas_archivo c
    join public.usuarios_empresa ue
      on ue.empresa_id = c.empresa_id
    join public.perfiles p
      on p.id = ue.perfil_id
    where c.id = p_carga_id
      and ue.perfil_id = (select auth.uid())
      and ue.activo = true
      and p.activo = true
      and (
        ue.rol = 'ADMIN'
        or (
          ue.rol = 'ANALISTA'
          and c.usuario_empresa_id = ue.id
        )
      )
  );
$$;

-- Las funciones SECURITY DEFINER no deben quedar disponibles para anon.
revoke all on function public.usuario_autenticado_activo() from public, anon;
revoke all on function public.es_miembro_empresa(uuid) from public, anon;
revoke all on function public.tiene_rol(uuid, public.rol_empresa_enum[]) from public, anon;
revoke all on function public.mi_membresia_id(uuid) from public, anon;
revoke all on function public.comparte_empresa(uuid) from public, anon;
revoke all on function public.puede_ver_venta(uuid) from public, anon;
revoke all on function public.puede_editar_venta_borrador(uuid) from public, anon;
revoke all on function public.puede_ver_carga(uuid) from public, anon;
revoke all on function public.puede_editar_carga(uuid) from public, anon;

grant execute on function public.usuario_autenticado_activo() to authenticated;
grant execute on function public.es_miembro_empresa(uuid) to authenticated;
grant execute on function public.tiene_rol(uuid, public.rol_empresa_enum[]) to authenticated;
grant execute on function public.mi_membresia_id(uuid) to authenticated;
grant execute on function public.comparte_empresa(uuid) to authenticated;
grant execute on function public.puede_ver_venta(uuid) to authenticated;
grant execute on function public.puede_editar_venta_borrador(uuid) to authenticated;
grant execute on function public.puede_ver_carga(uuid) to authenticated;
grant execute on function public.puede_editar_carga(uuid) to authenticated;

commit;
