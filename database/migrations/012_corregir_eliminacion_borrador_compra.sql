-- ComercioBI
-- Migración 012: corregir eliminación segura de borradores de compra
-- Ejecutar después de 011_compras_proveedores.sql.

begin;

create or replace function public.eliminar_compra_borrador(
  p_compra_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_estado public.estado_compra_enum;
  v_rol public.rol_empresa_enum;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para eliminar un borrador de compra.';
  end if;

  select c.empresa_id, c.estado
  into v_empresa_id, v_estado
  from public.compras c
  where c.id = p_compra_id
  for update;

  if v_empresa_id is null then
    raise exception 'La compra no existe o no está disponible.';
  end if;

  select ue.rol
  into v_rol
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  where ue.empresa_id = v_empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_rol is null or v_rol not in ('ADMIN', 'ALMACEN') then
    raise exception 'Tu rol no puede eliminar borradores de compra.';
  end if;

  if v_estado <> 'BORRADOR' then
    raise exception 'Solo se pueden eliminar compras en estado BORRADOR.';
  end if;

  delete from public.compras c
  where c.id = p_compra_id;
end;
$$;

revoke all on function public.eliminar_compra_borrador(uuid)
from public, anon;

grant execute on function public.eliminar_compra_borrador(uuid)
to authenticated;

commit;

notify pgrst, 'reload schema';
