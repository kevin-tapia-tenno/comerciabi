-- ComercioBI
-- Migración 001: tipos enumerados
-- Ejecutar una sola vez en una base de datos nueva.

begin;

create type public.rol_empresa_enum as enum (
  'ADMIN',
  'GERENTE',
  'VENDEDOR',
  'ALMACEN',
  'ANALISTA'
);

create type public.tipo_cliente_enum as enum (
  'PERSONA',
  'EMPRESA'
);

create type public.tipo_documento_enum as enum (
  'DNI',
  'RUC',
  'CE',
  'PASAPORTE',
  'OTRO'
);

create type public.segmento_cliente_enum as enum (
  'MINORISTA',
  'CORPORATIVO',
  'MAYORISTA',
  'OTRO'
);

create type public.unidad_medida_enum as enum (
  'UNIDAD',
  'CAJA',
  'PAQUETE',
  'KILOGRAMO',
  'LITRO'
);

create type public.estado_venta_enum as enum (
  'BORRADOR',
  'CONFIRMADA',
  'ANULADA'
);

create type public.tipo_movimiento_enum as enum (
  'ENTRADA',
  'SALIDA',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO',
  'REVERSA'
);

create type public.modulo_carga_enum as enum (
  'CLIENTES',
  'PRODUCTOS',
  'VENTAS'
);

create type public.estado_carga_enum as enum (
  'PENDIENTE',
  'VALIDANDO',
  'CON_ERRORES',
  'COMPLETADA',
  'CANCELADA'
);

commit;
