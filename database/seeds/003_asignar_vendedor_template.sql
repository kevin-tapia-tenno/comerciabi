-- ComercioBI
-- Plantilla para asignar un usuario de prueba con rol VENDEDOR.
-- Copia este contenido al SQL Editor y reemplaza los tres valores indicados.

do $$
declare
  v_correo text := 'REEMPLAZAR_CORREO_VENDEDOR';
  v_nombres text := 'Vendedor';
  v_apellidos text := 'Prueba';
  v_usuario_id uuid;
begin
  select u.id
    into v_usuario_id
  from auth.users u
  where lower(u.email) = lower(v_correo)
  limit 1;

  if v_usuario_id is null then
    raise exception
      'No existe un usuario de Auth con el correo indicado: %',
      v_correo;
  end if;

  insert into public.perfiles (
    id,
    nombres,
    apellidos,
    activo
  )
  values (
    v_usuario_id,
    v_nombres,
    v_apellidos,
    true
  )
  on conflict (id) do update
  set
    nombres = excluded.nombres,
    apellidos = excluded.apellidos,
    activo = true,
    actualizado_at = now();

  insert into public.usuarios_empresa (
    empresa_id,
    perfil_id,
    rol,
    activo
  )
  values (
    '00000000-0000-0000-0000-000000000001',
    v_usuario_id,
    'VENDEDOR',
    true
  )
  on conflict (empresa_id, perfil_id) do update
  set
    rol = 'VENDEDOR',
    activo = true,
    actualizado_at = now();
end;
$$;

select
  u.id as auth_user_id,
  u.email,
  p.nombres,
  p.apellidos,
  ue.rol,
  ue.activo,
  e.nombre as empresa
from auth.users u
join public.perfiles p
  on p.id = u.id
join public.usuarios_empresa ue
  on ue.perfil_id = p.id
join public.empresas e
  on e.id = ue.empresa_id
where lower(u.email) = lower('REEMPLAZAR_CORREO_VENDEDOR');
