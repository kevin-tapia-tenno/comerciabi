-- ComercioBI
-- Migración 009: operaciones transaccionales de ventas
-- Requiere las migraciones 001 a 008.
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

-- 1. Cada producto nuevo recibe una existencia en todos los almacenes activos.
create or replace function public.crear_existencias_producto_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.existencias_producto (
    almacen_id,
    producto_id,
    stock_actual,
    stock_minimo
  )
  select
    a.id,
    new.id,
    0,
    0
  from public.almacenes a
  where a.empresa_id = new.empresa_id
    and a.activo = true
  on conflict (almacen_id, producto_id) do nothing;

  return new;
end;
$$;

revoke all on function public.crear_existencias_producto_nuevo()
from public, anon, authenticated;

drop trigger if exists trg_crear_existencias_producto_nuevo
on public.productos;

create trigger trg_crear_existencias_producto_nuevo
after insert on public.productos
for each row
execute function public.crear_existencias_producto_nuevo();


-- 2. Cada almacén nuevo recibe existencias para todos los productos activos.
create or replace function public.crear_existencias_almacen_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.existencias_producto (
    almacen_id,
    producto_id,
    stock_actual,
    stock_minimo
  )
  select
    new.id,
    p.id,
    0,
    0
  from public.productos p
  where p.empresa_id = new.empresa_id
    and p.activo = true
  on conflict (almacen_id, producto_id) do nothing;

  return new;
end;
$$;

revoke all on function public.crear_existencias_almacen_nuevo()
from public, anon, authenticated;

drop trigger if exists trg_crear_existencias_almacen_nuevo
on public.almacenes;

create trigger trg_crear_existencias_almacen_nuevo
after insert on public.almacenes
for each row
execute function public.crear_existencias_almacen_nuevo();


-- 3. Completa existencias faltantes de productos y almacenes ya creados.
insert into public.existencias_producto (
  almacen_id,
  producto_id,
  stock_actual,
  stock_minimo
)
select
  a.id,
  p.id,
  0,
  0
from public.almacenes a
join public.productos p
  on p.empresa_id = a.empresa_id
where a.activo = true
  and p.activo = true
on conflict (almacen_id, producto_id) do nothing;


-- 4. Genera un código correlativo por empresa y día.
create or replace function public.generar_codigo_venta_interno(
  p_empresa_id uuid,
  p_fecha_venta timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona_horaria text;
  v_prefijo text;
  v_correlativo integer;
begin
  select e.zona_horaria
    into v_zona_horaria
  from public.empresas e
  where e.id = p_empresa_id
    and e.activo = true;

  if v_zona_horaria is null then
    raise exception 'La empresa no existe o está inactiva.';
  end if;

  v_prefijo := 'V-'
    || to_char(
      coalesce(p_fecha_venta, now()) at time zone v_zona_horaria,
      'YYYYMMDD'
    )
    || '-';

  perform pg_advisory_xact_lock(
    hashtextextended(p_empresa_id::text || ':' || v_prefijo, 0)
  );

  select coalesce(
    max(substring(v.codigo from char_length(v_prefijo) + 1)::integer),
    0
  ) + 1
    into v_correlativo
  from public.ventas v
  where v.empresa_id = p_empresa_id
    and v.codigo like v_prefijo || '%'
    and substring(v.codigo from char_length(v_prefijo) + 1) ~ '^[0-9]+$';

  return v_prefijo || lpad(v_correlativo::text, 4, '0');
end;
$$;

revoke all on function public.generar_codigo_venta_interno(uuid, timestamptz)
from public, anon, authenticated;


-- 5. Crea o actualiza una venta BORRADOR junto con todos sus detalles.
--    Toda la operación se ejecuta dentro de una sola transacción PostgreSQL.
create or replace function public.guardar_venta_borrador(
  p_venta_id uuid,
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_almacen_id uuid,
  p_canal_venta_id uuid,
  p_fecha_venta timestamptz,
  p_observaciones text,
  p_detalles jsonb
)
returns table (
  venta_id uuid,
  codigo text,
  subtotal numeric,
  descuento_total numeric,
  impuesto_total numeric,
  total numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_tasa_impuesto numeric(5,4);
  v_moneda varchar(3);
  v_venta public.ventas%rowtype;
  v_codigo text;
  v_total_detalles integer;
  v_productos_distintos integer;
  v_productos_validos integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para registrar una venta.';
  end if;

  select
    ue.id,
    ue.rol
  into
    v_membresia_id,
    v_rol
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  where ue.empresa_id = p_empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null
     or v_rol not in ('ADMIN', 'VENDEDOR') then
    raise exception 'Tu rol no puede registrar ventas.';
  end if;

  select
    e.tasa_impuesto,
    e.moneda
  into
    v_tasa_impuesto,
    v_moneda
  from public.empresas e
  where e.id = p_empresa_id
    and e.activo = true;

  if v_tasa_impuesto is null then
    raise exception 'La empresa no existe o se encuentra inactiva.';
  end if;

  if not exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.empresa_id = p_empresa_id
      and c.activo = true
  ) then
    raise exception 'Selecciona un cliente activo de la empresa.';
  end if;

  if not exists (
    select 1
    from public.almacenes a
    where a.id = p_almacen_id
      and a.empresa_id = p_empresa_id
      and a.activo = true
  ) then
    raise exception 'Selecciona un almacén activo de la empresa.';
  end if;

  if not exists (
    select 1
    from public.canales_venta cv
    where cv.id = p_canal_venta_id
      and cv.empresa_id = p_empresa_id
      and cv.activo = true
  ) then
    raise exception 'Selecciona un canal de venta activo.';
  end if;

  if p_detalles is null
     or jsonb_typeof(p_detalles) <> 'array'
     or jsonb_array_length(p_detalles) = 0 then
    raise exception 'La venta debe incluir al menos un producto.';
  end if;

  select
    count(*),
    count(distinct d.producto_id)
  into
    v_total_detalles,
    v_productos_distintos
  from jsonb_to_recordset(p_detalles) as d(
    producto_id uuid,
    cantidad numeric,
    precio_unitario numeric,
    descuento_linea numeric
  );

  if v_total_detalles <> v_productos_distintos then
    raise exception 'No se puede repetir un producto dentro de la venta.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_detalles) as d(
      producto_id uuid,
      cantidad numeric,
      precio_unitario numeric,
      descuento_linea numeric
    )
    where d.producto_id is null
      or d.cantidad is null
      or d.cantidad <= 0
      or d.precio_unitario is null
      or d.precio_unitario < 0
      or coalesce(d.descuento_linea, 0) < 0
      or coalesce(d.descuento_linea, 0)
        > round(d.cantidad * d.precio_unitario, 2)
  ) then
    raise exception 'Uno o más detalles contienen cantidades, precios o descuentos inválidos.';
  end if;

  select count(*)
    into v_productos_validos
  from public.productos p
  join (
    select distinct d.producto_id
    from jsonb_to_recordset(p_detalles) as d(
      producto_id uuid,
      cantidad numeric,
      precio_unitario numeric,
      descuento_linea numeric
    )
  ) seleccion
    on seleccion.producto_id = p.id
  where p.empresa_id = p_empresa_id
    and p.activo = true;

  if v_productos_validos <> v_total_detalles then
    raise exception 'La venta contiene productos inexistentes o inactivos.';
  end if;

  if p_venta_id is null then
    v_codigo := public.generar_codigo_venta_interno(
      p_empresa_id,
      coalesce(p_fecha_venta, now())
    );

    insert into public.ventas (
      empresa_id,
      codigo,
      cliente_id,
      vendedor_empresa_id,
      almacen_id,
      canal_venta_id,
      fecha_venta,
      estado,
      tasa_impuesto,
      moneda,
      observaciones
    )
    values (
      p_empresa_id,
      v_codigo,
      p_cliente_id,
      v_membresia_id,
      p_almacen_id,
      p_canal_venta_id,
      coalesce(p_fecha_venta, now()),
      'BORRADOR',
      v_tasa_impuesto,
      v_moneda,
      nullif(btrim(p_observaciones), '')
    )
    returning * into v_venta;
  else
    select v.*
      into v_venta
    from public.ventas v
    where v.id = p_venta_id
    for update;

    if v_venta.id is null then
      raise exception 'La venta indicada no existe.';
    end if;

    if v_venta.empresa_id <> p_empresa_id then
      raise exception 'La venta no pertenece a la empresa activa.';
    end if;

    if v_venta.estado <> 'BORRADOR' then
      raise exception 'Solo se pueden editar ventas en estado BORRADOR.';
    end if;

    if v_rol = 'VENDEDOR'
       and v_venta.vendedor_empresa_id <> v_membresia_id then
      raise exception 'Solo puedes editar tus propias ventas en borrador.';
    end if;

    update public.ventas v
    set
      cliente_id = p_cliente_id,
      almacen_id = p_almacen_id,
      canal_venta_id = p_canal_venta_id,
      fecha_venta = coalesce(p_fecha_venta, v.fecha_venta),
      tasa_impuesto = v_tasa_impuesto,
      moneda = v_moneda,
      observaciones = nullif(btrim(p_observaciones), '')
    where v.id = p_venta_id
    returning * into v_venta;

    delete from public.detalle_venta d
    where d.venta_id = p_venta_id;
  end if;

  insert into public.detalle_venta (
    venta_id,
    producto_id,
    cantidad,
    precio_unitario,
    costo_unitario,
    descuento_linea
  )
  select
    v_venta.id,
    d.producto_id,
    round(d.cantidad, 3),
    round(d.precio_unitario, 2),
    p.costo_actual,
    round(coalesce(d.descuento_linea, 0), 2)
  from jsonb_to_recordset(p_detalles) as d(
    producto_id uuid,
    cantidad numeric,
    precio_unitario numeric,
    descuento_linea numeric
  )
  join public.productos p
    on p.id = d.producto_id
   and p.empresa_id = p_empresa_id;

  return query
  select
    v.id,
    v.codigo::text,
    v.subtotal,
    v.descuento_total,
    v.impuesto_total,
    v.total
  from public.ventas v
  where v.id = v_venta.id;
end;
$$;

revoke all on function public.guardar_venta_borrador(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) from public, anon;

grant execute on function public.guardar_venta_borrador(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  jsonb
) to authenticated;


-- 6. Confirma una venta, descuenta stock e inserta el kardex de salida.
create or replace function public.confirmar_venta(p_venta_id uuid)
returns table (
  venta_id uuid,
  codigo text,
  estado public.estado_venta_enum,
  total numeric,
  confirmada_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta public.ventas%rowtype;
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_producto_problema text;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para confirmar una venta.';
  end if;

  select v.*
    into v_venta
  from public.ventas v
  where v.id = p_venta_id
  for update;

  if v_venta.id is null then
    raise exception 'La venta indicada no existe.';
  end if;

  select
    ue.id,
    ue.rol
  into
    v_membresia_id,
    v_rol
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  where ue.empresa_id = v_venta.empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null
     or v_rol not in ('ADMIN', 'VENDEDOR') then
    raise exception 'Tu rol no puede confirmar ventas.';
  end if;

  if v_rol = 'VENDEDOR'
     and v_venta.vendedor_empresa_id <> v_membresia_id then
    raise exception 'Solo puedes confirmar tus propias ventas.';
  end if;

  if v_venta.estado <> 'BORRADOR' then
    raise exception 'Solo se pueden confirmar ventas en estado BORRADOR.';
  end if;

  if not exists (
    select 1
    from public.detalle_venta d
    where d.venta_id = p_venta_id
  ) then
    raise exception 'La venta no tiene productos para confirmar.';
  end if;

  -- Bloquea las existencias involucradas para evitar sobreventa concurrente.
  perform e.id
  from public.existencias_producto e
  join public.detalle_venta d
    on d.producto_id = e.producto_id
   and d.venta_id = p_venta_id
  where e.almacen_id = v_venta.almacen_id
  order by e.id
  for update of e;

  select p.nombre
    into v_producto_problema
  from public.detalle_venta d
  join public.productos p
    on p.id = d.producto_id
  left join public.existencias_producto e
    on e.almacen_id = v_venta.almacen_id
   and e.producto_id = d.producto_id
  where d.venta_id = p_venta_id
    and (
      e.id is null
      or e.stock_actual < d.cantidad
    )
  order by p.nombre
  limit 1;

  if v_producto_problema is not null then
    raise exception 'Stock insuficiente o no configurado para el producto: %.',
      v_producto_problema;
  end if;

  insert into public.movimientos_inventario (
    empresa_id,
    almacen_id,
    producto_id,
    venta_id,
    usuario_empresa_id,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_resultante,
    motivo
  )
  select
    v_venta.empresa_id,
    v_venta.almacen_id,
    e.producto_id,
    v_venta.id,
    v_membresia_id,
    'SALIDA',
    d.cantidad,
    e.stock_actual,
    e.stock_actual - d.cantidad,
    'Confirmación de venta ' || v_venta.codigo
  from public.existencias_producto e
  join public.detalle_venta d
    on d.producto_id = e.producto_id
   and d.venta_id = p_venta_id
  where e.almacen_id = v_venta.almacen_id;

  update public.existencias_producto e
  set stock_actual = e.stock_actual - d.cantidad
  from public.detalle_venta d
  where d.venta_id = p_venta_id
    and e.almacen_id = v_venta.almacen_id
    and e.producto_id = d.producto_id;

  update public.ventas v
  set
    estado = 'CONFIRMADA',
    confirmada_at = now(),
    confirmada_por = v_membresia_id,
    motivo_anulacion = null,
    anulada_at = null,
    anulada_por = null
  where v.id = p_venta_id
  returning * into v_venta;

  return query
  select
    v_venta.id,
    v_venta.codigo::text,
    v_venta.estado,
    v_venta.total,
    v_venta.confirmada_at;
end;
$$;

revoke all on function public.confirmar_venta(uuid)
from public, anon;

grant execute on function public.confirmar_venta(uuid)
to authenticated;


-- 7. Anula una venta confirmada y devuelve el stock mediante una REVERSA.
--    Por control interno, solo el ADMIN puede anular ventas confirmadas.
create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo text
)
returns table (
  venta_id uuid,
  codigo text,
  estado public.estado_venta_enum,
  total numeric,
  anulada_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venta public.ventas%rowtype;
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para anular una venta.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Ingresa el motivo de anulación.';
  end if;

  select v.*
    into v_venta
  from public.ventas v
  where v.id = p_venta_id
  for update;

  if v_venta.id is null then
    raise exception 'La venta indicada no existe.';
  end if;

  select
    ue.id,
    ue.rol
  into
    v_membresia_id,
    v_rol
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  where ue.empresa_id = v_venta.empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null or v_rol <> 'ADMIN' then
    raise exception 'Solo un administrador puede anular ventas confirmadas.';
  end if;

  if v_venta.estado <> 'CONFIRMADA' then
    raise exception 'Solo se pueden anular ventas confirmadas.';
  end if;

  perform e.id
  from public.existencias_producto e
  join public.detalle_venta d
    on d.producto_id = e.producto_id
   and d.venta_id = p_venta_id
  where e.almacen_id = v_venta.almacen_id
  order by e.id
  for update of e;

  insert into public.movimientos_inventario (
    empresa_id,
    almacen_id,
    producto_id,
    venta_id,
    usuario_empresa_id,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_resultante,
    motivo
  )
  select
    v_venta.empresa_id,
    v_venta.almacen_id,
    e.producto_id,
    v_venta.id,
    v_membresia_id,
    'REVERSA',
    d.cantidad,
    e.stock_actual,
    e.stock_actual + d.cantidad,
    'Anulación de venta ' || v_venta.codigo || ': ' || btrim(p_motivo)
  from public.existencias_producto e
  join public.detalle_venta d
    on d.producto_id = e.producto_id
   and d.venta_id = p_venta_id
  where e.almacen_id = v_venta.almacen_id;

  update public.existencias_producto e
  set stock_actual = e.stock_actual + d.cantidad
  from public.detalle_venta d
  where d.venta_id = p_venta_id
    and e.almacen_id = v_venta.almacen_id
    and e.producto_id = d.producto_id;

  update public.ventas v
  set
    estado = 'ANULADA',
    motivo_anulacion = btrim(p_motivo),
    anulada_at = now(),
    anulada_por = v_membresia_id
  where v.id = p_venta_id
  returning * into v_venta;

  return query
  select
    v_venta.id,
    v_venta.codigo::text,
    v_venta.estado,
    v_venta.total,
    v_venta.anulada_at;
end;
$$;

revoke all on function public.anular_venta(uuid, text)
from public, anon;

grant execute on function public.anular_venta(uuid, text)
to authenticated;

commit;

-- Solicita a PostgREST actualizar su caché de funciones.
notify pgrst, 'reload schema';
