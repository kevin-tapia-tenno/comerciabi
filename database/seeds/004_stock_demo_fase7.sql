-- ComercioBI
-- Seed 004: stock inicial de demostración para probar confirmación de ventas.
-- Ejecutar una sola vez después de 009_operaciones_ventas.sql.
-- Es idempotente: no vuelve a cargar el mismo stock si ya existe el movimiento.

begin;

do $$
declare
  v_empresa_id uuid := '00000000-0000-0000-0000-000000000001';
  v_almacen_id uuid := '20000000-0000-0000-0000-000000000001';
  v_usuario_empresa_id uuid;
begin
  select ue.id
    into v_usuario_empresa_id
  from public.usuarios_empresa ue
  where ue.empresa_id = v_empresa_id
    and ue.rol = 'ADMIN'
    and ue.activo = true
  order by ue.creado_at
  limit 1;

  if v_usuario_empresa_id is null then
    raise exception 'No existe un administrador activo para registrar el stock demo.';
  end if;

  with stock_objetivo(producto_id, cantidad) as (
    values
      ('50000000-0000-0000-0000-000000000001'::uuid, 120::numeric),
      ('50000000-0000-0000-0000-000000000002'::uuid, 300::numeric),
      ('50000000-0000-0000-0000-000000000003'::uuid, 60::numeric),
      ('50000000-0000-0000-0000-000000000004'::uuid, 50::numeric),
      ('50000000-0000-0000-0000-000000000005'::uuid, 90::numeric),
      ('50000000-0000-0000-0000-000000000006'::uuid, 160::numeric),
      ('50000000-0000-0000-0000-000000000007'::uuid, 80::numeric),
      ('50000000-0000-0000-0000-000000000008'::uuid, 45::numeric)
  ),
  pendientes as (
    select
      e.id as existencia_id,
      e.producto_id,
      e.stock_actual as stock_anterior,
      so.cantidad
    from stock_objetivo so
    join public.existencias_producto e
      on e.almacen_id = v_almacen_id
     and e.producto_id = so.producto_id
    where not exists (
      select 1
      from public.movimientos_inventario mi
      where mi.almacen_id = v_almacen_id
        and mi.producto_id = so.producto_id
        and mi.motivo = 'Stock inicial de demostración - Fase 7'
    )
  ),
  movimientos_insertados as (
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
      v_empresa_id,
      v_almacen_id,
      p.producto_id,
      null,
      v_usuario_empresa_id,
      'ENTRADA',
      p.cantidad,
      p.stock_anterior,
      p.stock_anterior + p.cantidad,
      'Stock inicial de demostración - Fase 7'
    from pendientes p
    returning producto_id
  )
  update public.existencias_producto e
  set stock_actual = e.stock_actual + so.cantidad
  from stock_objetivo so
  where e.almacen_id = v_almacen_id
    and e.producto_id = so.producto_id
    and exists (
      select 1
      from movimientos_insertados mi
      where mi.producto_id = e.producto_id
    );
end;
$$;

commit;
