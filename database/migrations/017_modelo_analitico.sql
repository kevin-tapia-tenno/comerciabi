-- ComercioBI
-- Migración 017: modelo analítico (Fase 12)
-- Requiere las migraciones 001 a 016.
--
-- Objetivo:
--   Crear un esquema separado para análisis y Power BI, sin modificar
--   las tablas transaccionales que usa la aplicación React.
--
-- El modelo utiliza:
--   - dimensiones de fecha, empresa, cliente, producto, vendedor,
--     canal y almacén;
--   - hecho de ventas a nivel de línea de detalle;
--   - hecho de inventario a nivel de snapshot diario por producto/almacén;
--   - bitácora de ejecuciones ETL.
--
-- IMPORTANTE:
--   Este esquema NO se expone a anon/authenticated mediante PostgREST.
--   La carga de datos se realiza por conexión PostgreSQL desde el ETL Python.

begin;

create schema if not exists analytics;

revoke all on schema analytics from public;
revoke all on schema analytics from anon;
revoke all on schema analytics from authenticated;

-- ================================================================
-- 1. Bitácora ETL
-- ================================================================

create table if not exists analytics.etl_ejecuciones (
  id bigserial primary key,
  iniciado_en timestamptz not null default now(),
  finalizado_en timestamptz,
  estado text not null default 'EJECUTANDO'
    check (estado in ('EJECUTANDO', 'COMPLETADA', 'FALLIDA')),
  filas_ventas integer not null default 0
    check (filas_ventas >= 0),
  filas_inventario integer not null default 0
    check (filas_inventario >= 0),
  mensaje text,
  creado_por text not null default 'python-etl'
);

-- ================================================================
-- 2. Dimensiones
-- ================================================================

create table if not exists analytics.dim_fecha (
  fecha_key integer primary key,
  fecha date not null unique,
  anio smallint not null,
  trimestre smallint not null check (trimestre between 1 and 4),
  mes smallint not null check (mes between 1 and 12),
  mes_nombre text not null,
  semana_anio smallint not null,
  dia smallint not null check (dia between 1 and 31),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  dia_semana_nombre text not null,
  es_fin_semana boolean not null
);

create table if not exists analytics.dim_empresa (
  empresa_key bigserial primary key,
  source_empresa_id uuid not null unique,
  nombre text not null,
  zona_horaria text not null,
  activo boolean not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists analytics.dim_cliente (
  cliente_key bigserial primary key,
  source_cliente_id uuid not null unique,
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  nombre_completo text not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists analytics.dim_producto (
  producto_key bigserial primary key,
  source_producto_id uuid not null unique,
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  sku text not null,
  nombre text not null,
  categoria text,
  costo_actual numeric(18,4) not null default 0,
  activo boolean not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists analytics.dim_vendedor (
  vendedor_key bigserial primary key,
  source_vendedor_empresa_id uuid not null unique,
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  nombre_completo text not null,
  rol text not null,
  activo boolean not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists analytics.dim_canal (
  canal_key bigserial primary key,
  source_canal_id uuid not null unique,
  nombre text not null,
  actualizado_en timestamptz not null default now()
);

create table if not exists analytics.dim_almacen (
  almacen_key bigserial primary key,
  source_almacen_id uuid not null unique,
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  nombre text not null,
  activo boolean not null,
  actualizado_en timestamptz not null default now()
);

-- ================================================================
-- 3. Hecho de ventas
--    Grano: una fila por línea de detalle de una venta CONFIRMADA.
-- ================================================================

create table if not exists analytics.fact_ventas (
  fact_venta_key bigserial primary key,
  etl_ejecucion_id bigint not null
    references analytics.etl_ejecuciones(id),
  source_venta_id uuid not null,
  fecha_key integer not null
    references analytics.dim_fecha(fecha_key),
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  cliente_key bigint
    references analytics.dim_cliente(cliente_key),
  producto_key bigint not null
    references analytics.dim_producto(producto_key),
  vendedor_key bigint
    references analytics.dim_vendedor(vendedor_key),
  canal_key bigint
    references analytics.dim_canal(canal_key),
  codigo_venta text not null,
  moneda text not null,
  cantidad numeric(18,3) not null,
  precio_unitario numeric(18,4) not null,
  costo_unitario numeric(18,4) not null,
  descuento_linea numeric(18,4) not null default 0,
  descuento_cabecera_asignado numeric(18,4) not null default 0,
  venta_neta numeric(18,4) not null,
  impuesto_asignado numeric(18,4) not null default 0,
  facturacion numeric(18,4) not null,
  costo_total numeric(18,4) not null,
  utilidad_bruta numeric(18,4) not null,
  cargado_en timestamptz not null default now()
);

-- ================================================================
-- 4. Hecho de inventario
--    Grano: una fila por día + empresa + producto + almacén.
--    La tabla conserva snapshots históricos. Ejecutar el ETL otro día
--    agrega un nuevo snapshot; ejecutarlo varias veces el mismo día
--    actualiza ese snapshot y no lo duplica.
-- ================================================================

create table if not exists analytics.fact_inventario_snapshot (
  fact_inventario_key bigserial primary key,
  etl_ejecucion_id bigint not null
    references analytics.etl_ejecuciones(id),
  fecha_key integer not null
    references analytics.dim_fecha(fecha_key),
  empresa_key bigint not null
    references analytics.dim_empresa(empresa_key),
  producto_key bigint not null
    references analytics.dim_producto(producto_key),
  almacen_key bigint not null
    references analytics.dim_almacen(almacen_key),
  stock_actual numeric(18,3) not null,
  stock_minimo numeric(18,3) not null,
  costo_unitario numeric(18,4) not null,
  valor_stock numeric(18,4) not null,
  es_critico boolean not null,
  es_agotado boolean not null,
  cargado_en timestamptz not null default now(),
  constraint uq_fact_inventario_snapshot
    unique (fecha_key, empresa_key, producto_key, almacen_key)
);

-- ================================================================
-- 5. Índices para consultas analíticas
-- ================================================================

create index if not exists idx_fact_ventas_fecha
  on analytics.fact_ventas(fecha_key);

create index if not exists idx_fact_ventas_empresa
  on analytics.fact_ventas(empresa_key);

create index if not exists idx_fact_ventas_producto
  on analytics.fact_ventas(producto_key);

create index if not exists idx_fact_ventas_cliente
  on analytics.fact_ventas(cliente_key);

create index if not exists idx_fact_ventas_vendedor
  on analytics.fact_ventas(vendedor_key);

create index if not exists idx_fact_ventas_canal
  on analytics.fact_ventas(canal_key);

create index if not exists idx_fact_inventario_fecha
  on analytics.fact_inventario_snapshot(fecha_key);

create index if not exists idx_fact_inventario_empresa
  on analytics.fact_inventario_snapshot(empresa_key);

create index if not exists idx_fact_inventario_producto
  on analytics.fact_inventario_snapshot(producto_key);

create index if not exists idx_fact_inventario_almacen
  on analytics.fact_inventario_snapshot(almacen_key);

-- ================================================================
-- 6. Vistas legibles para inspección y para facilitar la Fase 13
-- ================================================================

create or replace view analytics.vw_ventas_analiticas as
select
  f.fact_venta_key,
  f.source_venta_id,
  df.fecha,
  df.anio,
  df.trimestre,
  df.mes,
  df.mes_nombre,
  de.nombre as empresa,
  dc.nombre_completo as cliente,
  dp.sku,
  dp.nombre as producto,
  dp.categoria,
  dv.nombre_completo as vendedor,
  dca.nombre as canal,
  f.codigo_venta,
  f.moneda,
  f.cantidad,
  f.precio_unitario,
  f.costo_unitario,
  f.descuento_linea,
  f.descuento_cabecera_asignado,
  f.venta_neta,
  f.impuesto_asignado,
  f.facturacion,
  f.costo_total,
  f.utilidad_bruta
from analytics.fact_ventas f
join analytics.dim_fecha df
  on df.fecha_key = f.fecha_key
join analytics.dim_empresa de
  on de.empresa_key = f.empresa_key
left join analytics.dim_cliente dc
  on dc.cliente_key = f.cliente_key
join analytics.dim_producto dp
  on dp.producto_key = f.producto_key
left join analytics.dim_vendedor dv
  on dv.vendedor_key = f.vendedor_key
left join analytics.dim_canal dca
  on dca.canal_key = f.canal_key;

create or replace view analytics.vw_inventario_analitico as
select
  f.fact_inventario_key,
  df.fecha,
  df.anio,
  df.mes,
  df.mes_nombre,
  de.nombre as empresa,
  dp.sku,
  dp.nombre as producto,
  dp.categoria,
  da.nombre as almacen,
  f.stock_actual,
  f.stock_minimo,
  f.costo_unitario,
  f.valor_stock,
  f.es_critico,
  f.es_agotado
from analytics.fact_inventario_snapshot f
join analytics.dim_fecha df
  on df.fecha_key = f.fecha_key
join analytics.dim_empresa de
  on de.empresa_key = f.empresa_key
join analytics.dim_producto dp
  on dp.producto_key = f.producto_key
join analytics.dim_almacen da
  on da.almacen_key = f.almacen_key;

-- Las tablas analíticas no forman parte de la API web del MVP.
revoke all on all tables in schema analytics from public, anon, authenticated;
revoke all on all sequences in schema analytics from public, anon, authenticated;

comment on schema analytics is
'Esquema analítico de ComercioBI para ETL, análisis y Power BI.';

comment on table analytics.fact_ventas is
'Hecho de ventas a nivel de línea para ventas CONFIRMADAS.';

comment on table analytics.fact_inventario_snapshot is
'Snapshot diario de inventario por producto y almacén.';

commit;
