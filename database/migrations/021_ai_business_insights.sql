-- ============================================================
-- ComercioBI
-- Fase 14.13 - Motor de Business Insights
-- Migracion 021
-- ============================================================

begin;

create table if not exists analytics.ai_insights (
    id bigserial primary key,
    ai_ejecucion_id bigint not null references analytics.ai_ejecuciones(id) on delete cascade,
    empresa_key bigint not null references analytics.dim_empresa(empresa_key),
    tipo text not null check (tipo in ('VENTAS','DEMANDA','INVENTARIO','MODELO','OPERACION')),
    severidad text not null check (severidad in ('INFO','BAJA','MEDIA','ALTA','CRITICA')),
    codigo text not null,
    titulo text not null,
    descripcion text not null,
    accion_recomendada text,
    valor numeric,
    unidad text,
    orden smallint not null default 100 check (orden >= 0),
    rule_version text not null default 'fase14-insights-v1',
    metadata jsonb not null default '{}'::jsonb,
    generado_en timestamptz not null default now(),
    constraint uq_ai_insights_ejecucion_codigo unique (ai_ejecucion_id, codigo)
);

create index if not exists idx_ai_insights_ejecucion
    on analytics.ai_insights (ai_ejecucion_id);
create index if not exists idx_ai_insights_empresa
    on analytics.ai_insights (empresa_key);
create index if not exists idx_ai_insights_severidad
    on analytics.ai_insights (severidad, orden);

comment on table analytics.ai_insights is
'Insights ejecutivos deterministas generados a partir de la salida validada de la capa IA de ComercioBI.';

create or replace view analytics.vw_ai_insights_actual as
select
    i.id,
    i.ai_ejecucion_id,
    i.empresa_key,
    u.empresa,
    i.tipo,
    i.severidad,
    i.codigo,
    i.titulo,
    i.descripcion,
    i.accion_recomendada,
    i.valor,
    i.unidad,
    i.orden,
    i.rule_version,
    i.metadata,
    i.generado_en
from analytics.ai_insights i
join analytics.vw_ai_ultima_ejecucion u
    on u.ai_ejecucion_id = i.ai_ejecucion_id
   and u.empresa_key = i.empresa_key;

comment on view analytics.vw_ai_insights_actual is
'Insights de negocio correspondientes a la ultima ejecucion IA de cada empresa.';

create or replace view analytics.vw_ai_insights_resumen_actual as
select
    ai_ejecucion_id,
    empresa_key,
    empresa,
    count(*) as insights_total,
    count(*) filter (where severidad = 'CRITICA') as insights_criticos,
    count(*) filter (where severidad = 'ALTA') as insights_altos,
    count(*) filter (where severidad = 'MEDIA') as insights_medios,
    count(*) filter (where severidad in ('INFO','BAJA')) as insights_informativos,
    jsonb_agg(
        jsonb_build_object(
            'id', id,
            'tipo', tipo,
            'severidad', severidad,
            'codigo', codigo,
            'titulo', titulo,
            'descripcion', descripcion,
            'accion_recomendada', accion_recomendada,
            'valor', valor,
            'unidad', unidad,
            'orden', orden,
            'rule_version', rule_version
        )
        order by orden, id
    ) as insights
from analytics.vw_ai_insights_actual
group by ai_ejecucion_id, empresa_key, empresa;

comment on view analytics.vw_ai_insights_resumen_actual is
'Resumen JSON listo para consumo por API, React y BI de los insights de la ultima ejecucion IA.';

commit;
