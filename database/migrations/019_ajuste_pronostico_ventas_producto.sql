-- ============================================================
-- ComercioBI
-- Fase 14 - IA y Pronósticos
-- Migración 019
--
-- Ajuste de granularidad de analytics.ai_pronostico_ventas
--
-- Motivo:
-- Los modelos de forecasting de ComercioBI generan pronósticos
-- de ventas por producto y periodo.
--
-- La versión inicial de ai_pronostico_ventas no almacenaba
-- producto_key, por lo que perdía la granularidad del modelo.
--
-- Nueva granularidad:
-- ejecución + empresa + producto + periodo
-- ============================================================

begin;

-- ============================================================
-- 1. Agregar producto_key
-- ============================================================

alter table analytics.ai_pronostico_ventas
    add column if not exists producto_key bigint;


-- ============================================================
-- 2. Validación preventiva
--
-- No permitimos continuar si ya existen pronósticos sin
-- producto asociado.
-- Actualmente la tabla debería estar vacía.
-- ============================================================

do $$
begin
    if exists (
        select 1
        from analytics.ai_pronostico_ventas
        where producto_key is null
    ) then
        raise exception
            'No se puede establecer producto_key como NOT NULL porque existen registros sin producto asociado.';
    end if;
end
$$;


-- ============================================================
-- 3. producto_key obligatorio
-- ============================================================

alter table analytics.ai_pronostico_ventas
    alter column producto_key set not null;


-- ============================================================
-- 4. Foreign Key hacia dim_producto
-- ============================================================

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'ai_pronostico_ventas_producto_key_fkey'
          and conrelid = 'analytics.ai_pronostico_ventas'::regclass
    ) then

        alter table analytics.ai_pronostico_ventas
            add constraint ai_pronostico_ventas_producto_key_fkey
            foreign key (producto_key)
            references analytics.dim_producto(producto_key);

    end if;
end
$$;


-- ============================================================
-- 5. Reemplazar restricción UNIQUE anterior
--
-- Antes:
-- ejecución + empresa + periodo
--
-- Ahora:
-- ejecución + empresa + producto + periodo
-- ============================================================

alter table analytics.ai_pronostico_ventas
    drop constraint if exists uq_ai_pronostico_ventas;

alter table analytics.ai_pronostico_ventas
    add constraint uq_ai_pronostico_ventas
    unique (
        ai_ejecucion_id,
        empresa_key,
        producto_key,
        periodo
    );


-- ============================================================
-- 6. Índice para consultas analíticas por producto y periodo
-- ============================================================

create index if not exists idx_ai_pronostico_ventas_producto_periodo
    on analytics.ai_pronostico_ventas (
        producto_key,
        periodo
    );


-- ============================================================
-- 7. Documentación
-- ============================================================

comment on column analytics.ai_pronostico_ventas.producto_key is
'Producto al que corresponde el pronóstico de ventas. Mantiene la granularidad producto-periodo utilizada por los modelos de forecasting.';

comment on table analytics.ai_pronostico_ventas is
'Pronósticos de venta neta por empresa, producto y periodo generados por la capa de IA de ComercioBI.';


commit;