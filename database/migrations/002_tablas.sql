-- ComercioBI
-- Migración 002: creación de las 14 tablas transaccionales
-- Requiere haber ejecutado 001_tipos_enumerados.sql.

begin;

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null,
  razon_social varchar(200),
  ruc varchar(11),
  moneda varchar(3) not null default 'PEN',
  zona_horaria text not null default 'America/Lima',
  tasa_impuesto numeric(5,4) not null default 0.1800,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint ck_empresas_nombre
    check (btrim(nombre) <> ''),
  constraint ck_empresas_razon_social
    check (razon_social is null or btrim(razon_social) <> ''),
  constraint ck_empresas_ruc
    check (ruc is null or ruc ~ '^[0-9]{11}$'),
  constraint ck_empresas_moneda
    check (moneda ~ '^[A-Z]{3}$'),
  constraint ck_empresas_tasa_impuesto
    check (tasa_impuesto between 0 and 1),
  constraint uq_empresas_ruc
    unique (ruc),
  constraint uq_empresas_id_empresa
    unique (id)
);

create table public.perfiles (
  id uuid primary key
    references auth.users(id) on delete cascade,
  nombres varchar(100) not null,
  apellidos varchar(100) not null,
  telefono varchar(30),
  avatar_url text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint ck_perfiles_nombres
    check (btrim(nombres) <> ''),
  constraint ck_perfiles_apellidos
    check (btrim(apellidos) <> ''),
  constraint ck_perfiles_telefono
    check (telefono is null or btrim(telefono) <> '')
);

create table public.usuarios_empresa (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  perfil_id uuid not null,
  rol public.rol_empresa_enum not null,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_usuarios_empresa_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_usuarios_empresa_perfil
    foreign key (perfil_id)
    references public.perfiles(id)
    on delete cascade,
  constraint uq_usuarios_empresa_membresia
    unique (empresa_id, perfil_id),
  constraint uq_usuarios_empresa_id_empresa
    unique (id, empresa_id)
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  tipo_cliente public.tipo_cliente_enum not null,
  tipo_documento public.tipo_documento_enum,
  numero_documento varchar(30),
  nombre_completo varchar(200) not null,
  email varchar(254),
  telefono varchar(30),
  segmento public.segmento_cliente_enum,
  direccion text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_clientes_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint ck_clientes_nombre
    check (btrim(nombre_completo) <> ''),
  constraint ck_clientes_documento_completo
    check (
      (tipo_documento is null and numero_documento is null)
      or
      (tipo_documento is not null and numero_documento is not null)
    ),
  constraint ck_clientes_numero_documento
    check (numero_documento is null or btrim(numero_documento) <> ''),
  constraint ck_clientes_email
    check (email is null or btrim(email) <> ''),
  constraint uq_clientes_documento
    unique (empresa_id, tipo_documento, numero_documento),
  constraint uq_clientes_id_empresa
    unique (id, empresa_id)
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nombre varchar(120) not null,
  descripcion text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_categorias_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint ck_categorias_nombre
    check (btrim(nombre) <> ''),
  constraint uq_categorias_id_empresa
    unique (id, empresa_id)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  categoria_id uuid not null,
  sku varchar(60) not null,
  nombre varchar(200) not null,
  descripcion text,
  unidad_medida public.unidad_medida_enum not null default 'UNIDAD',
  costo_actual numeric(14,2) not null default 0,
  precio_venta numeric(14,2) not null default 0,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_productos_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_productos_categoria_empresa
    foreign key (categoria_id, empresa_id)
    references public.categorias(id, empresa_id)
    on delete restrict,
  constraint ck_productos_sku
    check (btrim(sku) <> ''),
  constraint ck_productos_nombre
    check (btrim(nombre) <> ''),
  constraint ck_productos_costo
    check (costo_actual >= 0),
  constraint ck_productos_precio
    check (precio_venta >= 0),
  constraint uq_productos_empresa_sku
    unique (empresa_id, sku),
  constraint uq_productos_id_empresa
    unique (id, empresa_id)
);

create table public.almacenes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nombre varchar(120) not null,
  descripcion text,
  es_principal boolean not null default false,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_almacenes_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint ck_almacenes_nombre
    check (btrim(nombre) <> ''),
  constraint uq_almacenes_id_empresa
    unique (id, empresa_id)
);

create table public.existencias_producto (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null,
  producto_id uuid not null,
  stock_actual numeric(14,3) not null default 0,
  stock_minimo numeric(14,3) not null default 0,
  actualizado_at timestamptz not null default now(),

  constraint fk_existencias_almacen
    foreign key (almacen_id)
    references public.almacenes(id)
    on delete restrict,
  constraint fk_existencias_producto
    foreign key (producto_id)
    references public.productos(id)
    on delete restrict,
  constraint ck_existencias_stock_actual
    check (stock_actual >= 0),
  constraint ck_existencias_stock_minimo
    check (stock_minimo >= 0),
  constraint uq_existencias_almacen_producto
    unique (almacen_id, producto_id)
);

create table public.canales_venta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  nombre varchar(80) not null,
  descripcion text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_canales_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint ck_canales_nombre
    check (btrim(nombre) <> ''),
  constraint uq_canales_id_empresa
    unique (id, empresa_id)
);

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  codigo varchar(40) not null,
  cliente_id uuid not null,
  vendedor_empresa_id uuid not null,
  almacen_id uuid not null,
  canal_venta_id uuid not null,
  fecha_venta timestamptz not null default now(),
  estado public.estado_venta_enum not null default 'BORRADOR',
  subtotal numeric(14,2) not null default 0,
  descuento_total numeric(14,2) not null default 0,
  tasa_impuesto numeric(5,4) not null default 0.1800,
  impuesto_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  moneda varchar(3) not null default 'PEN',
  observaciones text,
  motivo_anulacion text,
  confirmada_at timestamptz,
  confirmada_por uuid,
  anulada_at timestamptz,
  anulada_por uuid,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_ventas_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_ventas_cliente_empresa
    foreign key (cliente_id, empresa_id)
    references public.clientes(id, empresa_id)
    on delete restrict,
  constraint fk_ventas_vendedor_empresa
    foreign key (vendedor_empresa_id, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint fk_ventas_almacen_empresa
    foreign key (almacen_id, empresa_id)
    references public.almacenes(id, empresa_id)
    on delete restrict,
  constraint fk_ventas_canal_empresa
    foreign key (canal_venta_id, empresa_id)
    references public.canales_venta(id, empresa_id)
    on delete restrict,
  constraint fk_ventas_confirmada_por_empresa
    foreign key (confirmada_por, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint fk_ventas_anulada_por_empresa
    foreign key (anulada_por, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint ck_ventas_codigo
    check (btrim(codigo) <> ''),
  constraint ck_ventas_importes
    check (
      subtotal >= 0
      and descuento_total >= 0
      and descuento_total <= subtotal
      and impuesto_total >= 0
      and total >= 0
    ),
  constraint ck_ventas_tasa_impuesto
    check (tasa_impuesto between 0 and 1),
  constraint ck_ventas_moneda
    check (moneda ~ '^[A-Z]{3}$'),
  constraint ck_ventas_confirmacion
    check (
      estado <> 'CONFIRMADA'
      or confirmada_at is not null
    ),
  constraint ck_ventas_anulacion
    check (
      estado <> 'ANULADA'
      or (
        confirmada_at is not null
        and anulada_at is not null
        and motivo_anulacion is not null
        and btrim(motivo_anulacion) <> ''
      )
    ),
  constraint uq_ventas_empresa_codigo
    unique (empresa_id, codigo),
  constraint uq_ventas_id_empresa
    unique (id, empresa_id)
);

create table public.detalle_venta (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null,
  producto_id uuid not null,
  cantidad numeric(14,3) not null,
  precio_unitario numeric(14,2) not null,
  costo_unitario numeric(14,2) not null,
  subtotal_linea numeric(14,2)
    generated always as (
      round(cantidad * precio_unitario, 2)
    ) stored,
  descuento_linea numeric(14,2) not null default 0,
  total_linea numeric(14,2)
    generated always as (
      round(cantidad * precio_unitario, 2) - descuento_linea
    ) stored,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_detalle_venta
    foreign key (venta_id)
    references public.ventas(id)
    on delete cascade,
  constraint fk_detalle_producto
    foreign key (producto_id)
    references public.productos(id)
    on delete restrict,
  constraint ck_detalle_cantidad
    check (cantidad > 0),
  constraint ck_detalle_precio
    check (precio_unitario >= 0),
  constraint ck_detalle_costo
    check (costo_unitario >= 0),
  constraint ck_detalle_descuento
    check (
      descuento_linea >= 0
      and descuento_linea <= round(cantidad * precio_unitario, 2)
    ),
  constraint uq_detalle_venta_producto
    unique (venta_id, producto_id)
);

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  almacen_id uuid not null,
  producto_id uuid not null,
  venta_id uuid,
  usuario_empresa_id uuid not null,
  tipo_movimiento public.tipo_movimiento_enum not null,
  cantidad numeric(14,3) not null,
  stock_anterior numeric(14,3) not null,
  stock_resultante numeric(14,3) not null,
  motivo text not null,
  fecha_movimiento timestamptz not null default now(),
  creado_at timestamptz not null default now(),

  constraint fk_movimientos_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_movimientos_almacen_empresa
    foreign key (almacen_id, empresa_id)
    references public.almacenes(id, empresa_id)
    on delete restrict,
  constraint fk_movimientos_producto_empresa
    foreign key (producto_id, empresa_id)
    references public.productos(id, empresa_id)
    on delete restrict,
  constraint fk_movimientos_venta_empresa
    foreign key (venta_id, empresa_id)
    references public.ventas(id, empresa_id)
    on delete restrict,
  constraint fk_movimientos_usuario_empresa
    foreign key (usuario_empresa_id, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint ck_movimientos_cantidad
    check (cantidad > 0),
  constraint ck_movimientos_stocks
    check (stock_anterior >= 0 and stock_resultante >= 0),
  constraint ck_movimientos_motivo
    check (btrim(motivo) <> '')
);

create table public.cargas_archivo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_empresa_id uuid not null,
  modulo public.modulo_carga_enum not null,
  nombre_archivo text not null,
  ruta_archivo text,
  estado public.estado_carga_enum not null default 'PENDIENTE',
  total_filas integer not null default 0,
  filas_validas integer not null default 0,
  filas_invalidas integer not null default 0,
  filas_insertadas integer not null default 0,
  creado_at timestamptz not null default now(),
  finalizado_at timestamptz,

  constraint fk_cargas_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_cargas_usuario_empresa
    foreign key (usuario_empresa_id, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint ck_cargas_nombre_archivo
    check (btrim(nombre_archivo) <> ''),
  constraint ck_cargas_contadores
    check (
      total_filas >= 0
      and filas_validas >= 0
      and filas_invalidas >= 0
      and filas_insertadas >= 0
      and filas_validas + filas_invalidas <= total_filas
      and filas_insertadas <= filas_validas
    )
);

create table public.errores_carga (
  id uuid primary key default gen_random_uuid(),
  carga_archivo_id uuid not null,
  numero_fila integer not null,
  campo text,
  valor_original text,
  codigo_error text,
  mensaje_error text not null,
  creado_at timestamptz not null default now(),

  constraint fk_errores_carga
    foreign key (carga_archivo_id)
    references public.cargas_archivo(id)
    on delete cascade,
  constraint ck_errores_numero_fila
    check (numero_fila > 0),
  constraint ck_errores_mensaje
    check (btrim(mensaje_error) <> '')
);

commit;
