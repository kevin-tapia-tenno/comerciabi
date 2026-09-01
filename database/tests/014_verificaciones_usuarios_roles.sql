-- ============================================================
-- ComercioBI
-- Fase 15 - Verificaciones estructurales de usuarios y roles
-- Ejecutar después de database/migrations/023_usuarios_roles_admin.sql
-- ============================================================

-- 1. La función administrativa debe existir y ser SECURITY DEFINER.
select
    n.nspname as schema_name,
    p.proname as function_name,
    p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'listar_usuarios_empresa_admin';

-- Esperado: 1 fila, security_definer = true.

-- 2. La protección del último administrador debe existir.
select
    n.nspname as schema_name,
    p.proname as function_name,
    p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'proteger_ultimo_admin_empresa';

-- Esperado: 1 fila, security_definer = true.

-- 3. El trigger debe estar instalado sobre usuarios_empresa.
select
    t.tgname as trigger_name,
    c.relname as table_name,
    t.tgenabled as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'usuarios_empresa'
  and t.tgname = 'trg_proteger_ultimo_admin_empresa'
  and not t.tgisinternal;

-- Esperado: 1 fila, enabled = O.

-- 4. authenticated debe poder ejecutar el listado administrativo.
select has_function_privilege(
    'authenticated',
    'public.listar_usuarios_empresa_admin(uuid)',
    'EXECUTE'
) as authenticated_can_execute_admin_list;

-- Esperado: true.

-- 5. anon NO debe poder ejecutar el listado administrativo.
select has_function_privilege(
    'anon',
    'public.listar_usuarios_empresa_admin(uuid)',
    'EXECUTE'
) as anon_can_execute_admin_list;

-- Esperado: false.

-- ============================================================
-- Prueba funcional recomendada desde la aplicación:
--
-- A. Iniciar sesión como ADMIN y abrir /usuarios.
-- B. Ver usuarios activos e inactivos de la empresa.
-- C. Cambiar el rol de un usuario no administrador.
-- D. Desactivar y reactivar una membresía.
-- E. Verificar que no sea posible desactivar/cambiar el rol del
--    último ADMIN activo.
-- ============================================================
