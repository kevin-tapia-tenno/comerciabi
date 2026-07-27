-- ComercioBI
-- Migración 010: operaciones controladas de inventario
-- Requiere las migraciones 001 a 009.
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

-- 1. Registra entradas y ajustes manuales de inventario.
--    SALIDA y REVERSA continúan reservadas para el flujo de ventas.
create or replace function public.registrar_movimiento_inventario(
  p_empresa_id uuid,
  p_almacen_id uuid,
  p_producto_id uuid,
  p_tipo_movimiento public.tipo_movimiento_enum,
  p_cantidad numeric,
  p_motivo text
)
returns table (
  movimiento_id uuid,
  stock_anterior numeric,
  stock_resultante numeric,
  tipo_movimiento public.tipo_movimiento_enum,
  fecha_movimiento timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_existencia public.existencias_producto%rowtype;
  v_stock_resultante numeric(14,3);
  v_movimiento public.movimientos_inventario%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para registrar movimientos de inventario.';
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
     or v_rol not in ('ADMIN', 'ALMACEN') then
    raise exception 'Tu rol no puede registrar movimientos manuales de inventario.';
  end if;

  if p_tipo_movimiento is null
     or p_tipo_movimiento not in (
    'ENTRADA',
    'AJUSTE_POSITIVO',
    'AJUSTE_NEGATIVO'
  ) then
    raise exception 'El tipo de movimiento manual no está permitido.';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Ingresa un motivo para el movimiento.';
  end if;

  if not exists (
    select 1
    from public.almacenes a
    where a.id = p_almacen_id
      and a.empresa_id = p_empresa_id
      and a.activo = true
  ) then
    raise exception 'El almacén no existe, está inactivo o no pertenece a la empresa.';
  end if;

  if not exists (
    select 1
    from public.productos p
    where p.id = p_producto_id
      and p.empresa_id = p_empresa_id
      and p.activo = true
  ) then
    raise exception 'El producto no existe, está inactivo o no pertenece a la empresa.';
  end if;

  select e.*
    into v_existencia
  from public.existencias_producto e
  where e.almacen_id = p_almacen_id
    and e.producto_id = p_producto_id
  for update;

  if v_existencia.id is null then
    raise exception 'No existe una configuración de stock para el producto y almacén seleccionados.';
  end if;

  if p_tipo_movimiento in ('ENTRADA', 'AJUSTE_POSITIVO') then
    v_stock_resultante := round(v_existencia.stock_actual + p_cantidad, 3);
  else
    v_stock_resultante := round(v_existencia.stock_actual - p_cantidad, 3);
  end if;

  if v_stock_resultante < 0 then
    raise exception 'El movimiento dejaría el stock en negativo. Stock disponible: %.',
      trim(to_char(v_existencia.stock_actual, 'FM999999999990.000'));
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
  values (
    p_empresa_id,
    p_almacen_id,
    p_producto_id,
    null,
    v_membresia_id,
    p_tipo_movimiento,
    round(p_cantidad, 3),
    v_existencia.stock_actual,
    v_stock_resultante,
    btrim(p_motivo)
  )
  returning * into v_movimiento;

  update public.existencias_producto e
  set stock_actual = v_stock_resultante
  where e.id = v_existencia.id;

  return query
  select
    v_movimiento.id,
    v_movimiento.stock_anterior,
    v_movimiento.stock_resultante,
    v_movimiento.tipo_movimiento,
    v_movimiento.fecha_movimiento;
end;
$$;

revoke all on function public.registrar_movimiento_inventario(
  uuid,
  uuid,
  uuid,
  public.tipo_movimiento_enum,
  numeric,
  text
) from public, anon;

grant execute on function public.registrar_movimiento_inventario(
  uuid,
  uuid,
  uuid,
  public.tipo_movimiento_enum,
  numeric,
  text
) to authenticated;


-- 2. Actualiza el stock mínimo de una existencia.
create or replace function public.actualizar_stock_minimo(
  p_empresa_id uuid,
  p_almacen_id uuid,
  p_producto_id uuid,
  p_stock_minimo numeric
)
returns table (
  existencia_id uuid,
  stock_actual numeric,
  stock_minimo numeric,
  actualizado_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_existencia public.existencias_producto%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para actualizar el stock mínimo.';
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
     or v_rol not in ('ADMIN', 'ALMACEN') then
    raise exception 'Tu rol no puede actualizar el stock mínimo.';
  end if;

  if p_stock_minimo is null or p_stock_minimo < 0 then
    raise exception 'El stock mínimo debe ser mayor o igual a cero.';
  end if;

  if not exists (
    select 1
    from public.almacenes a
    where a.id = p_almacen_id
      and a.empresa_id = p_empresa_id
      and a.activo = true
  ) then
    raise exception 'El almacén no existe, está inactivo o no pertenece a la empresa.';
  end if;

  if not exists (
    select 1
    from public.productos p
    where p.id = p_producto_id
      and p.empresa_id = p_empresa_id
      and p.activo = true
  ) then
    raise exception 'El producto no existe, está inactivo o no pertenece a la empresa.';
  end if;

  select e.*
    into v_existencia
  from public.existencias_producto e
  where e.almacen_id = p_almacen_id
    and e.producto_id = p_producto_id
  for update;

  if v_existencia.id is null then
    raise exception 'No existe una configuración de stock para el producto y almacén seleccionados.';
  end if;

  update public.existencias_producto e
  set stock_minimo = round(p_stock_minimo, 3)
  where e.id = v_existencia.id
  returning e.* into v_existencia;

  return query
  select
    v_existencia.id,
    v_existencia.stock_actual,
    v_existencia.stock_minimo,
    v_existencia.actualizado_at;
end;
$$;

revoke all on function public.actualizar_stock_minimo(
  uuid,
  uuid,
  uuid,
  numeric
) from public, anon;

grant execute on function public.actualizar_stock_minimo(
  uuid,
  uuid,
  uuid,
  numeric
) to authenticated;

commit;

-- Solicita a PostgREST actualizar la caché de funciones.
notify pgrst, 'reload schema';
