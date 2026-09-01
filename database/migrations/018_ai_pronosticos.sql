-- ComercioBI
-- Migración 018: almacenamiento para IA y pronósticos (Fase 14)
-- Requiere la migración 017_modelo_analitico.sql.
--
-- Objetivo:
-- Almacenar ejecuciones de modelos, pronósticos comerciales,
-- pronósticos de demanda y recomendaciones de inventario.
--
-- IMPORTANTE:
-- - No modifica fact_ventas.
-- - No modifica fact_inventario_snapshot.
-- - El esquema analytics continúa sin exposición directa a
--   public, anon ni authenticated.
-- - La aplicación React accederá posteriormente mediante
--   funciones PostgreSQL controladas.

begin;

-- ================================================================
-- 1. Bitácora de ejecuciones de IA
-- ================================================================

create table if not exists analytics.ai_ejecuciones (
    id bigserial primary key,

    empresa_key bigint not null
        references analytics.dim_empresa(empresa_key),

    iniciado_en timestamptz not null default now(),
    finalizado_en timestamptz,

    estado text not null default 'EJECUTANDO'
        check (
            estado in (
                'EJECUTANDO',
                'COMPLETADA',
                'FALLIDA'
            )
        ),

    origen_datos text not null
        check (
            origen_datos in (
                'REAL',
                'DEMO'
            )
        ),

    algoritmo_ventas text,
    algoritmo_demanda text,

    mae_ventas numeric(18,6),
    mae_ventas_baseline numeric(18,6),

    mae_demanda numeric(18,6),
    mae_demanda_baseline numeric(18,6),

    filas_entrenamiento_ventas integer not null default 0
        check (filas_entrenamiento_ventas >= 0),

    filas_entrenamiento_demanda integer not null default 0
        check (filas_entrenamiento_demanda >= 0),

    periodo_inicio date,
    periodo_fin date,

    version_modelo text not null default 'fase14-v1',

    metadata jsonb not null default '{}'::jsonb,

    mensaje text,

    creado_por text not null default 'python-ai',

    constraint ck_ai_ejecuciones_fechas
        check (
            finalizado_en is null
            or finalizado_en >= iniciado_en
        ),

    constraint ck_ai_ejecuciones_periodo
        check (
            periodo_inicio is null
            or periodo_fin is null
            or periodo_inicio <= periodo_fin
        ),

    constraint ck_ai_ejecuciones_mae_ventas
        check (
            mae_ventas is null
            or mae_ventas >= 0
        ),

    constraint ck_ai_ejecuciones_mae_ventas_baseline
        check (
            mae_ventas_baseline is null
            or mae_ventas_baseline >= 0
        ),

    constraint ck_ai_ejecuciones_mae_demanda
        check (
            mae_demanda is null
            or mae_demanda >= 0
        ),

    constraint ck_ai_ejecuciones_mae_demanda_baseline
        check (
            mae_demanda_baseline is null
            or mae_demanda_baseline >= 0
        )
);


-- ================================================================
-- 2. Pronóstico mensual de ventas
-- Grano:
-- una fila por ejecución + empresa + mes pronosticado.
-- ================================================================

create table if not exists analytics.ai_pronostico_ventas (
    id bigserial primary key,

    ai_ejecucion_id bigint not null
        references analytics.ai_ejecuciones(id)
        on delete cascade,

    empresa_key bigint not null
        references analytics.dim_empresa(empresa_key),

    periodo date not null,

    venta_neta_pronosticada numeric(18,4) not null
        check (venta_neta_pronosticada >= 0),

    limite_inferior numeric(18,4) not null
        check (limite_inferior >= 0),

    limite_superior numeric(18,4) not null
        check (limite_superior >= 0),

    modelo text not null,

    origen_datos text not null
        check (
            origen_datos in (
                'REAL',
                'DEMO'
            )
        ),

    generado_en timestamptz not null default now(),

    constraint ck_ai_pronostico_ventas_intervalo
        check (
            limite_inferior
            <= venta_neta_pronosticada
            and venta_neta_pronosticada
            <= limite_superior
        ),

    constraint uq_ai_pronostico_ventas
        unique (
            ai_ejecucion_id,
            empresa_key,
            periodo
        )
);


-- ================================================================
-- 3. Pronóstico de demanda por producto
-- Grano:
-- una fila por ejecución + empresa + producto + horizonte.
-- ================================================================

create table if not exists analytics.ai_pronostico_demanda (
    id bigserial primary key,

    ai_ejecucion_id bigint not null
        references analytics.ai_ejecuciones(id)
        on delete cascade,

    empresa_key bigint not null
        references analytics.dim_empresa(empresa_key),

    producto_key bigint not null
        references analytics.dim_producto(producto_key),

    fecha_inicio date not null,
    fecha_fin date not null,

    horizonte_dias smallint not null default 30
        check (horizonte_dias > 0),

    unidades_pronosticadas numeric(18,3) not null
        check (unidades_pronosticadas >= 0),

    limite_inferior numeric(18,3) not null
        check (limite_inferior >= 0),

    limite_superior numeric(18,3) not null
        check (limite_superior >= 0),

    modelo text not null,

    origen_datos text not null
        check (
            origen_datos in (
                'REAL',
                'DEMO'
            )
        ),

    generado_en timestamptz not null default now(),

    constraint ck_ai_pronostico_demanda_fechas
        check (
            fecha_inicio <= fecha_fin
        ),

    constraint ck_ai_pronostico_demanda_intervalo
        check (
            limite_inferior
            <= unidades_pronosticadas
            and unidades_pronosticadas
            <= limite_superior
        ),

    constraint uq_ai_pronostico_demanda
        unique (
            ai_ejecucion_id,
            empresa_key,
            producto_key,
            fecha_inicio,
            fecha_fin
        )
);


-- ================================================================
-- 4. Recomendaciones de inventario
-- Grano:
-- una fila por ejecución + empresa + producto + almacén.
-- ================================================================

create table if not exists analytics.ai_recomendacion_inventario (
    id bigserial primary key,

    ai_ejecucion_id bigint not null
        references analytics.ai_ejecuciones(id)
        on delete cascade,

    empresa_key bigint not null
        references analytics.dim_empresa(empresa_key),

    producto_key bigint not null
        references analytics.dim_producto(producto_key),

    almacen_key bigint not null
        references analytics.dim_almacen(almacen_key),

    fecha_referencia date not null,

    stock_actual numeric(18,3) not null
        check (stock_actual >= 0),

    stock_minimo numeric(18,3) not null
        check (stock_minimo >= 0),

    demanda_30d numeric(18,3) not null
        check (demanda_30d >= 0),

    stock_objetivo numeric(18,3) not null
        check (stock_objetivo >= 0),

    cantidad_sugerida numeric(18,3) not null
        check (cantidad_sugerida >= 0),

    cobertura_dias numeric(10,2),

    riesgo text not null
        check (
            riesgo in (
                'BAJO',
                'MEDIO',
                'ALTO',
                'CRITICO'
            )
        ),

    motivo text not null,

    generado_en timestamptz not null default now(),

    constraint ck_ai_recomendacion_cobertura
        check (
            cobertura_dias is null
            or cobertura_dias >= 0
        ),

    constraint uq_ai_recomendacion_inventario
        unique (
            ai_ejecucion_id,
            empresa_key,
            producto_key,
            almacen_key
        )
);


-- ================================================================
-- 5. Índices
-- ================================================================

create index if not exists idx_ai_ejecuciones_empresa
    on analytics.ai_ejecuciones(empresa_key);

create index if not exists idx_ai_ejecuciones_estado
    on analytics.ai_ejecuciones(estado);

create index if not exists idx_ai_ejecuciones_iniciado
    on analytics.ai_ejecuciones(iniciado_en desc);


create index if not exists idx_ai_pronostico_ventas_empresa
    on analytics.ai_pronostico_ventas(empresa_key);

create index if not exists idx_ai_pronostico_ventas_periodo
    on analytics.ai_pronostico_ventas(periodo);


create index if not exists idx_ai_pronostico_demanda_empresa
    on analytics.ai_pronostico_demanda(empresa_key);

create index if not exists idx_ai_pronostico_demanda_producto
    on analytics.ai_pronostico_demanda(producto_key);

create index if not exists idx_ai_pronostico_demanda_fecha
    on analytics.ai_pronostico_demanda(fecha_inicio, fecha_fin);


create index if not exists idx_ai_recomendacion_empresa
    on analytics.ai_recomendacion_inventario(empresa_key);

create index if not exists idx_ai_recomendacion_producto
    on analytics.ai_recomendacion_inventario(producto_key);

create index if not exists idx_ai_recomendacion_almacen
    on analytics.ai_recomendacion_inventario(almacen_key);

create index if not exists idx_ai_recomendacion_riesgo
    on analytics.ai_recomendacion_inventario(riesgo);


-- ================================================================
-- 6. Seguridad
-- ================================================================

revoke all
on
    analytics.ai_ejecuciones,
    analytics.ai_pronostico_ventas,
    analytics.ai_pronostico_demanda,
    analytics.ai_recomendacion_inventario
from public, anon, authenticated;

revoke all
on all sequences in schema analytics
from public, anon, authenticated;


-- ================================================================
-- 7. Documentación PostgreSQL
-- ================================================================

comment on table analytics.ai_ejecuciones is
'Bitácora de ejecuciones de modelos predictivos de ComercioBI.';

comment on table analytics.ai_pronostico_ventas is
'Pronóstico mensual de venta neta generado por la capa de IA.';

comment on table analytics.ai_pronostico_demanda is
'Pronóstico de demanda futura por producto.';

comment on table analytics.ai_recomendacion_inventario is
'Recomendaciones de reposición construidas con demanda pronosticada y estado de inventario.';


commit;