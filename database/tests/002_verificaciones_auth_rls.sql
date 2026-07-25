-- ComercioBI
-- Verificaciones seguras de autenticación, funciones, roles y RLS.
-- No modifica datos.

-- 1. Trigger de creación automática de perfiles.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'on_auth_user_created';

-- 2. Funciones de autorización esperadas.
select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'crear_perfil_nuevo_usuario',
    'usuario_autenticado_activo',
    'es_miembro_empresa',
    'tiene_rol',
    'mi_membresia_id',
    'comparte_empresa',
    'puede_ver_venta',
    'puede_editar_venta_borrador',
    'puede_ver_carga',
    'puede_editar_carga'
  )
order by routine_name;

-- 3. Cantidad de políticas de ComercioBI.
select count(*) as total_politicas
from pg_policies
where schemaname = 'public'
  and tablename in (
    'empresas',
    'perfiles',
    'usuarios_empresa',
    'clientes',
    'categorias',
    'productos',
    'almacenes',
    'existencias_producto',
    'canales_venta',
    'ventas',
    'detalle_venta',
    'movimientos_inventario',
    'cargas_archivo',
    'errores_carga'
  );

-- 4. Listado de políticas.
select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 5. Usuarios, perfiles y membresías.
select
  u.id as auth_user_id,
  u.email,
  u.email_confirmed_at,
  p.nombres,
  p.apellidos,
  p.activo as perfil_activo,
  e.nombre as empresa,
  ue.rol,
  ue.activo as membresia_activa
from auth.users u
left join public.perfiles p
  on p.id = u.id
left join public.usuarios_empresa ue
  on ue.perfil_id = p.id
left join public.empresas e
  on e.id = ue.empresa_id
order by u.created_at;

-- 6. Resumen final.
select
  (select count(*) from auth.users) as usuarios_auth,
  (select count(*) from public.perfiles) as perfiles,
  (select count(*) from public.usuarios_empresa) as membresias,
  (
    select count(*)
    from public.usuarios_empresa
    where rol = 'ADMIN'
      and activo = true
  ) as administradores_activos,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
  ) as politicas_public;
