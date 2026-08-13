-- ComercioBI
-- Fase 14
-- Verificaciones iniciales de almacenamiento de IA


-- ================================================================
-- PRUEBA 1. Deben existir las cuatro tablas
-- Resultado esperado: 4
-- ================================================================

select count(*) as tablas_ai
from information_schema.tables
where table_schema = 'analytics'
and table_name in (
    'ai_ejecuciones',
    'ai_pronostico_ventas',
    'ai_pronostico_demanda',
    'ai_recomendacion_inventario'
);


-- ================================================================
-- PRUEBA 2. Las tablas deben estar vacías antes del primer modelo
-- Resultado esperado: cuatro valores 0
-- ================================================================

select
    (select count(*)
     from analytics.ai_ejecuciones)
        as ejecuciones,

    (select count(*)
     from analytics.ai_pronostico_ventas)
        as pronosticos_ventas,

    (select count(*)
     from analytics.ai_pronostico_demanda)
        as pronosticos_demanda,

    (select count(*)
     from analytics.ai_recomendacion_inventario)
        as recomendaciones;


-- ================================================================
-- PRUEBA 3. No deben existir privilegios directos para
-- anon/authenticated.
-- Resultado esperado: 0 filas
-- ================================================================

select
    table_name,
    grantee,
    privilege_type
from information_schema.role_table_grants
where table_schema = 'analytics'
and table_name in (
    'ai_ejecuciones',
    'ai_pronostico_ventas',
    'ai_pronostico_demanda',
    'ai_recomendacion_inventario'
)
and grantee in (
    'anon',
    'authenticated'
);


-- ================================================================
-- PRUEBA 4. Deben existir claves foráneas.
-- Resultado esperado: varias filas.
-- ================================================================

select
    tc.table_name,
    kcu.column_name,
    ccu.table_name as tabla_referenciada,
    ccu.column_name as columna_referenciada
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
    and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
and tc.table_schema = 'analytics'
and tc.table_name like 'ai_%'
order by
    tc.table_name,
    kcu.column_name;


-- ================================================================
-- PRUEBA 5. El modelo analítico anterior sigue intacto.
-- Resultado esperado:
-- fact_ventas >= 1
-- fact_inventario_snapshot >= 1
-- ================================================================

select
    'fact_ventas' as objeto,
    count(*) as filas
from analytics.fact_ventas

union all

select
    'fact_inventario_snapshot',
    count(*)
from analytics.fact_inventario_snapshot;


-- ================================================================
-- PRUEBA 6. Dimensiones necesarias disponibles.
-- ================================================================

select
    'dim_empresa' as objeto,
    count(*) as filas
from analytics.dim_empresa

union all

select
    'dim_producto',
    count(*)
from analytics.dim_producto

union all

select
    'dim_almacen',
    count(*)
from analytics.dim_almacen;