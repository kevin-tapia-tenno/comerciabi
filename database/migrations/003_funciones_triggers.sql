-- ComercioBI
-- Migración 003: funciones y triggers
-- Requiere haber ejecutado 002_tablas.sql.

begin;

-- 1. Actualiza automáticamente la columna actualizado_at.
create or replace function public.establecer_actualizado_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.actualizado_at := now();
  return new;
end;
$$;

create trigger trg_empresas_actualizado_at
before update on public.empresas
for each row execute function public.establecer_actualizado_at();

create trigger trg_perfiles_actualizado_at
before update on public.perfiles
for each row execute function public.establecer_actualizado_at();

create trigger trg_usuarios_empresa_actualizado_at
before update on public.usuarios_empresa
for each row execute function public.establecer_actualizado_at();

create trigger trg_clientes_actualizado_at
before update on public.clientes
for each row execute function public.establecer_actualizado_at();

create trigger trg_categorias_actualizado_at
before update on public.categorias
for each row execute function public.establecer_actualizado_at();

create trigger trg_productos_actualizado_at
before update on public.productos
for each row execute function public.establecer_actualizado_at();

create trigger trg_almacenes_actualizado_at
before update on public.almacenes
for each row execute function public.establecer_actualizado_at();

create trigger trg_existencias_actualizado_at
before update on public.existencias_producto
for each row execute function public.establecer_actualizado_at();

create trigger trg_canales_actualizado_at
before update on public.canales_venta
for each row execute function public.establecer_actualizado_at();

create trigger trg_ventas_actualizado_at
before update on public.ventas
for each row execute function public.establecer_actualizado_at();

create trigger trg_detalle_actualizado_at
before update on public.detalle_venta
for each row execute function public.establecer_actualizado_at();


-- 2. Verifica que el producto y el almacén de una existencia
--    pertenezcan a la misma empresa.
create or replace function public.validar_existencia_misma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_almacen uuid;
  v_empresa_producto uuid;
begin
  select empresa_id
    into v_empresa_almacen
  from public.almacenes
  where id = new.almacen_id;

  select empresa_id
    into v_empresa_producto
  from public.productos
  where id = new.producto_id;

  if v_empresa_almacen is not null
     and v_empresa_producto is not null
     and v_empresa_almacen <> v_empresa_producto then
    raise exception
      'El almacén y el producto deben pertenecer a la misma empresa.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_existencia_empresa
before insert or update of almacen_id, producto_id
on public.existencias_producto
for each row execute function public.validar_existencia_misma_empresa();


-- 3. Verifica que el producto del detalle pertenezca
--    a la misma empresa que la venta.
create or replace function public.validar_detalle_venta_misma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_venta uuid;
  v_empresa_producto uuid;
begin
  select empresa_id
    into v_empresa_venta
  from public.ventas
  where id = new.venta_id;

  select empresa_id
    into v_empresa_producto
  from public.productos
  where id = new.producto_id;

  if v_empresa_venta is not null
     and v_empresa_producto is not null
     and v_empresa_venta <> v_empresa_producto then
    raise exception
      'El producto y la venta deben pertenecer a la misma empresa.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_detalle_empresa
before insert or update of venta_id, producto_id
on public.detalle_venta
for each row execute function public.validar_detalle_venta_misma_empresa();


-- 4. Impide modificar detalles de una venta que ya no está en BORRADOR.
create or replace function public.validar_venta_editable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_venta_id uuid;
  v_estado public.estado_venta_enum;
begin
  if tg_op = 'DELETE' then
    v_venta_id := old.venta_id;
  else
    v_venta_id := new.venta_id;
  end if;

  select estado
    into v_estado
  from public.ventas
  where id = v_venta_id;

  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception
      'Solo se pueden modificar detalles de ventas en estado BORRADOR.';
  end if;

  if tg_op = 'UPDATE' and new.venta_id <> old.venta_id then
    select estado
      into v_estado
    from public.ventas
    where id = old.venta_id;

    if v_estado is not null and v_estado <> 'BORRADOR' then
      raise exception
        'No se puede retirar un detalle de una venta que no está en BORRADOR.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger trg_validar_venta_editable
before insert or update or delete
on public.detalle_venta
for each row execute function public.validar_venta_editable();


-- 5. Recalcula los importes de una venta a partir de sus detalles.
create or replace function public.recalcular_una_venta(p_venta_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  with totales as (
    select
      coalesce(sum(d.subtotal_linea), 0)::numeric(14,2) as subtotal,
      coalesce(sum(d.descuento_linea), 0)::numeric(14,2) as descuento
    from public.detalle_venta d
    where d.venta_id = p_venta_id
  )
  update public.ventas v
  set
    subtotal = t.subtotal,
    descuento_total = t.descuento,
    impuesto_total = round(
      (t.subtotal - t.descuento) * v.tasa_impuesto,
      2
    ),
    total = round(
      (t.subtotal - t.descuento)
      + ((t.subtotal - t.descuento) * v.tasa_impuesto),
      2
    )
  from totales t
  where v.id = p_venta_id;
end;
$$;

create or replace function public.recalcular_venta_desde_detalle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_una_venta(old.venta_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and new.venta_id <> old.venta_id then
    perform public.recalcular_una_venta(old.venta_id);
  end if;

  perform public.recalcular_una_venta(new.venta_id);
  return new;
end;
$$;

create trigger trg_recalcular_venta
after insert or update or delete
on public.detalle_venta
for each row execute function public.recalcular_venta_desde_detalle();

commit;
