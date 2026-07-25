-- ComercioBI
-- Migración 004: índices y restricciones únicas adicionales
-- Requiere haber ejecutado 003_funciones_triggers.sql.

begin;

-- Unicidad sin distinguir mayúsculas/minúsculas.
create unique index uq_categorias_empresa_nombre_ci
  on public.categorias (empresa_id, lower(nombre));

create unique index uq_almacenes_empresa_nombre_ci
  on public.almacenes (empresa_id, lower(nombre));

create unique index uq_canales_empresa_nombre_ci
  on public.canales_venta (empresa_id, lower(nombre));

-- Una sola ubicación principal activa por empresa.
create unique index uq_almacen_principal_activo
  on public.almacenes (empresa_id)
  where es_principal = true and activo = true;

-- Índices para búsquedas y relaciones frecuentes.
create index idx_usuarios_empresa_perfil
  on public.usuarios_empresa (perfil_id);

create index idx_usuarios_empresa_empresa_rol
  on public.usuarios_empresa (empresa_id, rol);

create index idx_clientes_empresa_nombre
  on public.clientes (empresa_id, nombre_completo);

create index idx_clientes_empresa_activo
  on public.clientes (empresa_id, activo);

create index idx_productos_categoria
  on public.productos (categoria_id);

create index idx_productos_empresa_nombre
  on public.productos (empresa_id, nombre);

create index idx_productos_empresa_activo
  on public.productos (empresa_id, activo);

create index idx_existencias_producto
  on public.existencias_producto (producto_id);

create index idx_existencias_stock_critico
  on public.existencias_producto (almacen_id, stock_actual, stock_minimo);

create index idx_ventas_empresa_fecha
  on public.ventas (empresa_id, fecha_venta desc);

create index idx_ventas_empresa_estado_fecha
  on public.ventas (empresa_id, estado, fecha_venta desc);

create index idx_ventas_cliente
  on public.ventas (cliente_id);

create index idx_ventas_vendedor
  on public.ventas (vendedor_empresa_id);

create index idx_ventas_canal
  on public.ventas (canal_venta_id);

create index idx_detalle_venta
  on public.detalle_venta (venta_id);

create index idx_detalle_producto
  on public.detalle_venta (producto_id);

create index idx_movimientos_empresa_fecha
  on public.movimientos_inventario (empresa_id, fecha_movimiento desc);

create index idx_movimientos_almacen_producto_fecha
  on public.movimientos_inventario (
    almacen_id,
    producto_id,
    fecha_movimiento desc
  );

create index idx_movimientos_venta
  on public.movimientos_inventario (venta_id)
  where venta_id is not null;

create index idx_cargas_empresa_fecha
  on public.cargas_archivo (empresa_id, creado_at desc);

create index idx_cargas_estado
  on public.cargas_archivo (estado);

create index idx_errores_carga
  on public.errores_carga (carga_archivo_id, numero_fila);

commit;
