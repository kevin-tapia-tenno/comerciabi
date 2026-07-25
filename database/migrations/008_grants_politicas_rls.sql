-- ComercioBI
-- Migración 008: privilegios y políticas Row Level Security
-- Requiere haber ejecutado 006 y 007.

begin;

-- 1. Sin acceso anónimo a las tablas empresariales.
revoke all on table
  public.empresas,
  public.perfiles,
  public.usuarios_empresa,
  public.clientes,
  public.categorias,
  public.productos,
  public.almacenes,
  public.existencias_producto,
  public.canales_venta,
  public.ventas,
  public.detalle_venta,
  public.movimientos_inventario,
  public.cargas_archivo,
  public.errores_carga
from anon;

grant usage on schema public to authenticated;

-- 2. Lectura: RLS decidirá qué filas puede ver cada usuario.
grant select on table
  public.empresas,
  public.perfiles,
  public.usuarios_empresa,
  public.clientes,
  public.categorias,
  public.productos,
  public.almacenes,
  public.existencias_producto,
  public.canales_venta,
  public.ventas,
  public.detalle_venta,
  public.movimientos_inventario,
  public.cargas_archivo,
  public.errores_carga
to authenticated;

-- 3. Escritura con privilegios de columna mínimos.
grant update (
  nombre,
  razon_social,
  ruc,
  moneda,
  zona_horaria,
  tasa_impuesto,
  activo
) on public.empresas to authenticated;

grant update (
  nombres,
  apellidos,
  telefono,
  avatar_url
) on public.perfiles to authenticated;

grant insert on public.usuarios_empresa to authenticated;
grant update (rol, activo) on public.usuarios_empresa to authenticated;

grant insert on public.clientes to authenticated;
grant update (
  tipo_cliente,
  tipo_documento,
  numero_documento,
  nombre_completo,
  email,
  telefono,
  segmento,
  direccion,
  activo
) on public.clientes to authenticated;

grant insert on public.categorias to authenticated;
grant update (nombre, descripcion, activo)
on public.categorias to authenticated;

grant insert on public.productos to authenticated;
grant update (
  categoria_id,
  sku,
  nombre,
  descripcion,
  unidad_medida,
  costo_actual,
  precio_venta,
  activo
) on public.productos to authenticated;

grant insert on public.almacenes to authenticated;
grant update (nombre, descripcion, es_principal, activo)
on public.almacenes to authenticated;

grant insert on public.canales_venta to authenticated;
grant update (nombre, descripcion, activo)
on public.canales_venta to authenticated;

grant insert (
  empresa_id,
  codigo,
  cliente_id,
  vendedor_empresa_id,
  almacen_id,
  canal_venta_id,
  fecha_venta,
  tasa_impuesto,
  moneda,
  observaciones
) on public.ventas to authenticated;

grant update (
  cliente_id,
  almacen_id,
  canal_venta_id,
  fecha_venta,
  tasa_impuesto,
  moneda,
  observaciones
) on public.ventas to authenticated;

grant delete on public.ventas to authenticated;

grant insert (
  venta_id,
  producto_id,
  cantidad,
  precio_unitario,
  costo_unitario,
  descuento_linea
) on public.detalle_venta to authenticated;

grant update (
  cantidad,
  precio_unitario,
  costo_unitario,
  descuento_linea
) on public.detalle_venta to authenticated;

grant delete on public.detalle_venta to authenticated;

grant insert on public.cargas_archivo to authenticated;
grant update (
  estado,
  total_filas,
  filas_validas,
  filas_invalidas,
  filas_insertadas,
  finalizado_at,
  ruta_archivo
) on public.cargas_archivo to authenticated;

grant insert on public.errores_carga to authenticated;

-- 4. Retira acceso directo a funciones internas de la Fase 3.
revoke execute on function public.establecer_actualizado_at() from public, anon, authenticated;
revoke execute on function public.validar_existencia_misma_empresa() from public, anon, authenticated;
revoke execute on function public.validar_detalle_venta_misma_empresa() from public, anon, authenticated;
revoke execute on function public.validar_venta_editable() from public, anon, authenticated;
revoke execute on function public.recalcular_una_venta(uuid) from public, anon, authenticated;
revoke execute on function public.recalcular_venta_desde_detalle() from public, anon, authenticated;

-- 5. Elimina políticas anteriores con los mismos nombres.
drop policy if exists empresas_select_miembros on public.empresas;
drop policy if exists empresas_update_admin on public.empresas;

drop policy if exists perfiles_select_compania on public.perfiles;
drop policy if exists perfiles_update_propio on public.perfiles;

drop policy if exists usuarios_empresa_select_miembros on public.usuarios_empresa;
drop policy if exists usuarios_empresa_insert_admin on public.usuarios_empresa;
drop policy if exists usuarios_empresa_update_admin on public.usuarios_empresa;

drop policy if exists clientes_select_miembros on public.clientes;
drop policy if exists clientes_insert_operativos on public.clientes;
drop policy if exists clientes_update_operativos on public.clientes;

drop policy if exists categorias_select_miembros on public.categorias;
drop policy if exists categorias_insert_admin on public.categorias;
drop policy if exists categorias_update_admin on public.categorias;

drop policy if exists productos_select_miembros on public.productos;
drop policy if exists productos_insert_admin on public.productos;
drop policy if exists productos_update_admin on public.productos;

drop policy if exists almacenes_select_miembros on public.almacenes;
drop policy if exists almacenes_insert_admin on public.almacenes;
drop policy if exists almacenes_update_admin on public.almacenes;

drop policy if exists existencias_select_miembros on public.existencias_producto;

drop policy if exists canales_select_miembros on public.canales_venta;
drop policy if exists canales_insert_admin on public.canales_venta;
drop policy if exists canales_update_admin on public.canales_venta;

drop policy if exists ventas_select_miembros on public.ventas;
drop policy if exists ventas_insert_vendedor on public.ventas;
drop policy if exists ventas_update_borrador on public.ventas;
drop policy if exists ventas_delete_borrador on public.ventas;

drop policy if exists detalle_select_miembros on public.detalle_venta;
drop policy if exists detalle_insert_borrador on public.detalle_venta;
drop policy if exists detalle_update_borrador on public.detalle_venta;
drop policy if exists detalle_delete_borrador on public.detalle_venta;

drop policy if exists movimientos_select_miembros on public.movimientos_inventario;

drop policy if exists cargas_select_miembros on public.cargas_archivo;
drop policy if exists cargas_insert_analista on public.cargas_archivo;
drop policy if exists cargas_update_analista on public.cargas_archivo;

drop policy if exists errores_select_miembros on public.errores_carga;
drop policy if exists errores_insert_analista on public.errores_carga;

-- 6. Empresas.
create policy empresas_select_miembros
on public.empresas
for select
to authenticated
using (public.es_miembro_empresa(id));

create policy empresas_update_admin
on public.empresas
for update
to authenticated
using (
  public.tiene_rol(
    id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 7. Perfiles.
create policy perfiles_select_compania
on public.perfiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.comparte_empresa(id)
);

create policy perfiles_update_propio
on public.perfiles
for update
to authenticated
using (
  id = (select auth.uid())
  and public.usuario_autenticado_activo()
)
with check (
  id = (select auth.uid())
  and public.usuario_autenticado_activo()
);

-- 8. Membresías y roles.
create policy usuarios_empresa_select_miembros
on public.usuarios_empresa
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy usuarios_empresa_insert_admin
on public.usuarios_empresa
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

create policy usuarios_empresa_update_admin
on public.usuarios_empresa
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 9. Clientes.
create policy clientes_select_miembros
on public.clientes
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy clientes_insert_operativos
on public.clientes
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'VENDEDOR', 'ANALISTA']::public.rol_empresa_enum[]
  )
);

create policy clientes_update_operativos
on public.clientes
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'VENDEDOR', 'ANALISTA']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'VENDEDOR', 'ANALISTA']::public.rol_empresa_enum[]
  )
);

-- 10. Categorías.
create policy categorias_select_miembros
on public.categorias
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy categorias_insert_admin
on public.categorias
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

create policy categorias_update_admin
on public.categorias
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 11. Productos.
create policy productos_select_miembros
on public.productos
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy productos_insert_admin
on public.productos
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

create policy productos_update_admin
on public.productos
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 12. Almacenes.
create policy almacenes_select_miembros
on public.almacenes
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy almacenes_insert_admin
on public.almacenes
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

create policy almacenes_update_admin
on public.almacenes
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 13. Existencias: lectura; las modificaciones serán mediante funciones controladas.
create policy existencias_select_miembros
on public.existencias_producto
for select
to authenticated
using (
  exists (
    select 1
    from public.almacenes a
    where a.id = existencias_producto.almacen_id
      and public.es_miembro_empresa(a.empresa_id)
  )
);

-- 14. Canales.
create policy canales_select_miembros
on public.canales_venta
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy canales_insert_admin
on public.canales_venta
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

create policy canales_update_admin
on public.canales_venta
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN']::public.rol_empresa_enum[]
  )
);

-- 15. Ventas.
create policy ventas_select_miembros
on public.ventas
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy ventas_insert_vendedor
on public.ventas
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'VENDEDOR']::public.rol_empresa_enum[]
  )
  and vendedor_empresa_id = public.mi_membresia_id(empresa_id)
  and estado = 'BORRADOR'
);

create policy ventas_update_borrador
on public.ventas
for update
to authenticated
using (public.puede_editar_venta_borrador(id))
with check (
  public.puede_editar_venta_borrador(id)
  and estado = 'BORRADOR'
);

create policy ventas_delete_borrador
on public.ventas
for delete
to authenticated
using (public.puede_editar_venta_borrador(id));

-- 16. Detalle de ventas.
create policy detalle_select_miembros
on public.detalle_venta
for select
to authenticated
using (public.puede_ver_venta(venta_id));

create policy detalle_insert_borrador
on public.detalle_venta
for insert
to authenticated
with check (public.puede_editar_venta_borrador(venta_id));

create policy detalle_update_borrador
on public.detalle_venta
for update
to authenticated
using (public.puede_editar_venta_borrador(venta_id))
with check (public.puede_editar_venta_borrador(venta_id));

create policy detalle_delete_borrador
on public.detalle_venta
for delete
to authenticated
using (public.puede_editar_venta_borrador(venta_id));

-- 17. Movimientos de inventario: solo lectura desde la API.
create policy movimientos_select_miembros
on public.movimientos_inventario
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

-- 18. Cargas de archivos.
create policy cargas_select_miembros
on public.cargas_archivo
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy cargas_insert_analista
on public.cargas_archivo
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'ANALISTA']::public.rol_empresa_enum[]
  )
  and usuario_empresa_id = public.mi_membresia_id(empresa_id)
);

create policy cargas_update_analista
on public.cargas_archivo
for update
to authenticated
using (public.puede_editar_carga(id))
with check (public.puede_editar_carga(id));

-- 19. Errores de carga.
create policy errores_select_miembros
on public.errores_carga
for select
to authenticated
using (public.puede_ver_carga(carga_archivo_id));

create policy errores_insert_analista
on public.errores_carga
for insert
to authenticated
with check (public.puede_editar_carga(carga_archivo_id));

commit;
