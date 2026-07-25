-- ComercioBI
-- Migración 006: sincronización entre auth.users y public.perfiles
-- Ejecutar después de la Fase 3.

begin;

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombres text;
  v_apellidos text;
begin
  v_nombres := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nombres'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Usuario'
  );

  v_apellidos := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'apellidos'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'last_name'), ''),
    'Sin apellido'
  );

  insert into public.perfiles (
    id,
    nombres,
    apellidos,
    avatar_url,
    activo
  )
  values (
    new.id,
    v_nombres,
    v_apellidos,
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.crear_perfil_nuevo_usuario();

-- Sincroniza usuarios que pudieron haberse creado antes del trigger.
insert into public.perfiles (
  id,
  nombres,
  apellidos,
  avatar_url,
  activo
)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'nombres'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''),
    'Usuario'
  ),
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'apellidos'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'last_name'), ''),
    'Sin apellido'
  ),
  nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
  true
from auth.users u
on conflict (id) do nothing;

revoke all on function public.crear_perfil_nuevo_usuario() from public;
revoke all on function public.crear_perfil_nuevo_usuario() from anon;
revoke all on function public.crear_perfil_nuevo_usuario() from authenticated;

commit;
