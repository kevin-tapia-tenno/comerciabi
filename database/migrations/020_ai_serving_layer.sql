-- ============================================================
-- ComercioBI
-- Fase 14 - IA y Pronósticos
-- Migración 020
--
-- Capa SQL de consumo / serving layer de IA
--
-- Objetivo:
--   Desacoplar las tablas físicas de IA de sus consumidores:
--
--   - Aplicación web
--   - API
--   - Power BI
--   - Automatizaciones
--
-- Se exponen únicamente resultados de ejecuciones COMPLETADAS.
-- ============================================================

begin;


-- ============================================================
-- 1. Última ejecución IA completada por empresa
-- ============================================================

create or replace view analytics.vw_ai_ultima_ejecucion
as
with ranked as (
    select
        e.*,
        row_number() over (
            partition by e.empresa_key
            order by
                e.finalizado_en desc nulls last,
                e.id desc
        ) as rn
    from analytics.ai_ejecuciones e
    where e.estado = 'COMPLETADA'
)
select
    r.id as ai_ejecucion_id,
    r.empresa_key,
    emp.nombre as empresa,

    r.iniciado_en,
    r.finalizado_en,

    r.estado,
    r.origen_datos,

    r.algoritmo_ventas,
    r.algoritmo_demanda,

    r.mae_ventas,
    r.mae_ventas_baseline,

    r.mae_demanda,
    r.mae_demanda_baseline,

    r.filas_entrenamiento_ventas,
    r.filas_entrenamiento_demanda,

    r.periodo_inicio,
    r.periodo_fin,

    r.version_modelo,
    r.metadata,
    r.mensaje,
    r.creado_por

from ranked r

join analytics.dim_empresa emp
    on emp.empresa_key = r.empresa_key

where r.rn = 1;


comment on view analytics.vw_ai_ultima_ejecucion is
'Última ejecución IA completada por empresa. Punto de entrada para consumir resultados vigentes de modelos predictivos.';


-- ============================================================
-- 2. Último pronóstico de ventas
-- ============================================================

create or replace view analytics.vw_ai_pronostico_ventas_actual
as
select
    v.ai_ejecucion_id,

    v.empresa_key,
    emp.nombre as empresa,

    v.producto_key,
    p.sku,
    p.nombre as producto,
    p.categoria,

    v.periodo,

    v.venta_neta_pronosticada,
    v.limite_inferior,
    v.limite_superior,

    v.limite_superior - v.limite_inferior
        as amplitud_intervalo,

    case
        when v.venta_neta_pronosticada > 0
        then
            (
                (v.limite_superior - v.limite_inferior)
                / v.venta_neta_pronosticada
            ) * 100
        else null
    end as amplitud_intervalo_pct,

    v.modelo,
    v.origen_datos,
    v.generado_en

from analytics.ai_pronostico_ventas v

join analytics.vw_ai_ultima_ejecucion u
    on u.ai_ejecucion_id = v.ai_ejecucion_id

join analytics.dim_empresa emp
    on emp.empresa_key = v.empresa_key

join analytics.dim_producto p
    on p.producto_key = v.producto_key;


comment on view analytics.vw_ai_pronostico_ventas_actual is
'Pronóstico vigente de ventas por empresa, producto y periodo, incluyendo intervalos de incertidumbre.';


-- ============================================================
-- 3. Último pronóstico de demanda
-- ============================================================

create or replace view analytics.vw_ai_pronostico_demanda_actual
as
select
    d.ai_ejecucion_id,

    d.empresa_key,
    emp.nombre as empresa,

    d.producto_key,
    p.sku,
    p.nombre as producto,
    p.categoria,

    d.fecha_inicio,
    d.fecha_fin,
    d.horizonte_dias,

    d.unidades_pronosticadas,
    d.limite_inferior,
    d.limite_superior,

    d.limite_superior - d.limite_inferior
        as amplitud_intervalo,

    case
        when d.unidades_pronosticadas > 0
        then
            (
                (d.limite_superior - d.limite_inferior)
                / d.unidades_pronosticadas
            ) * 100
        else null
    end as amplitud_intervalo_pct,

    d.modelo,
    d.origen_datos,
    d.generado_en

from analytics.ai_pronostico_demanda d

join analytics.vw_ai_ultima_ejecucion u
    on u.ai_ejecucion_id = d.ai_ejecucion_id

join analytics.dim_empresa emp
    on emp.empresa_key = d.empresa_key

join analytics.dim_producto p
    on p.producto_key = d.producto_key;


comment on view analytics.vw_ai_pronostico_demanda_actual is
'Pronóstico vigente de demanda por producto y horizonte diario, incluyendo intervalos de incertidumbre.';


-- ============================================================
-- 4. Recomendaciones vigentes de inventario
-- ============================================================

create or replace view analytics.vw_ai_recomendacion_inventario_actual
as
select
    r.ai_ejecucion_id,

    r.empresa_key,
    emp.nombre as empresa,

    r.producto_key,
    p.sku,
    p.nombre as producto,
    p.categoria,

    r.almacen_key,
    a.nombre as almacen,

    r.fecha_referencia,

    r.stock_actual,
    r.stock_minimo,

    r.demanda_30d,

    r.stock_objetivo,
    r.cantidad_sugerida,

    r.cobertura_dias,

    r.riesgo,

    case r.riesgo
        when 'CRITICO' then 4
        when 'ALTO' then 3
        when 'MEDIO' then 2
        when 'BAJO' then 1
        else 0
    end as riesgo_orden,

    case
        when r.cantidad_sugerida > 0
            then true
        else false
    end as requiere_reposicion,

    r.motivo,
    r.generado_en

from analytics.ai_recomendacion_inventario r

join analytics.vw_ai_ultima_ejecucion u
    on u.ai_ejecucion_id = r.ai_ejecucion_id

join analytics.dim_empresa emp
    on emp.empresa_key = r.empresa_key

join analytics.dim_producto p
    on p.producto_key = r.producto_key

join analytics.dim_almacen a
    on a.almacen_key = r.almacen_key;


comment on view analytics.vw_ai_recomendacion_inventario_actual is
'Recomendaciones vigentes de reposición de inventario derivadas del pronóstico de demanda y del stock disponible.';


-- ============================================================
-- 5. Resumen ejecutivo IA por empresa
-- ============================================================

create or replace view analytics.vw_ai_resumen_actual
as
with ventas as (
    select
        empresa_key,

        sum(venta_neta_pronosticada)
            as venta_pronosticada_total,

        sum(limite_inferior)
            as venta_pronosticada_inferior,

        sum(limite_superior)
            as venta_pronosticada_superior,

        count(distinct producto_key)
            as productos_ventas_pronosticados,

        min(periodo)
            as primer_periodo_ventas,

        max(periodo)
            as ultimo_periodo_ventas

    from analytics.vw_ai_pronostico_ventas_actual

    group by empresa_key
),

demanda as (
    select
        empresa_key,

        sum(unidades_pronosticadas)
            as demanda_pronosticada_total,

        sum(limite_inferior)
            as demanda_pronosticada_inferior,

        sum(limite_superior)
            as demanda_pronosticada_superior,

        count(distinct producto_key)
            as productos_demanda_pronosticados,

        min(fecha_inicio)
            as primera_fecha_demanda,

        max(fecha_fin)
            as ultima_fecha_demanda

    from analytics.vw_ai_pronostico_demanda_actual

    group by empresa_key
),

inventario as (
    select
        empresa_key,

        count(*)
            as recomendaciones_inventario,

        count(*) filter (
            where riesgo = 'CRITICO'
        ) as productos_criticos,

        count(*) filter (
            where riesgo = 'ALTO'
        ) as productos_riesgo_alto,

        count(*) filter (
            where riesgo = 'MEDIO'
        ) as productos_riesgo_medio,

        count(*) filter (
            where riesgo = 'BAJO'
        ) as productos_riesgo_bajo,

        count(*) filter (
            where requiere_reposicion
        ) as productos_a_reponer,

        sum(cantidad_sugerida)
            as unidades_reposicion_sugeridas,

        avg(cobertura_dias)
            as cobertura_promedio_dias

    from analytics.vw_ai_recomendacion_inventario_actual

    group by empresa_key
)

select
    u.ai_ejecucion_id,

    u.empresa_key,
    u.empresa,

    u.origen_datos,
    u.version_modelo,

    u.algoritmo_ventas,
    u.algoritmo_demanda,

    u.mae_ventas,
    u.mae_ventas_baseline,

    case
        when u.mae_ventas_baseline > 0
             and u.mae_ventas is not null
        then
            (
                (
                    u.mae_ventas_baseline
                    - u.mae_ventas
                )
                / u.mae_ventas_baseline
            ) * 100
        else null
    end as mejora_ventas_pct,

    u.mae_demanda,
    u.mae_demanda_baseline,

    case
        when u.mae_demanda_baseline > 0
             and u.mae_demanda is not null
        then
            (
                (
                    u.mae_demanda_baseline
                    - u.mae_demanda
                )
                / u.mae_demanda_baseline
            ) * 100
        else null
    end as mejora_demanda_pct,

    u.filas_entrenamiento_ventas,
    u.filas_entrenamiento_demanda,

    v.venta_pronosticada_total,
    v.venta_pronosticada_inferior,
    v.venta_pronosticada_superior,
    v.productos_ventas_pronosticados,
    v.primer_periodo_ventas,
    v.ultimo_periodo_ventas,

    d.demanda_pronosticada_total,
    d.demanda_pronosticada_inferior,
    d.demanda_pronosticada_superior,
    d.productos_demanda_pronosticados,
    d.primera_fecha_demanda,
    d.ultima_fecha_demanda,

    i.recomendaciones_inventario,

    i.productos_criticos,
    i.productos_riesgo_alto,
    i.productos_riesgo_medio,
    i.productos_riesgo_bajo,

    i.productos_a_reponer,
    i.unidades_reposicion_sugeridas,
    i.cobertura_promedio_dias,

    u.finalizado_en as ultima_actualizacion_modelo

from analytics.vw_ai_ultima_ejecucion u

left join ventas v
    on v.empresa_key = u.empresa_key

left join demanda d
    on d.empresa_key = u.empresa_key

left join inventario i
    on i.empresa_key = u.empresa_key;


comment on view analytics.vw_ai_resumen_actual is
'Resumen ejecutivo de la última ejecución IA de cada empresa para web, API y BI.';


commit;