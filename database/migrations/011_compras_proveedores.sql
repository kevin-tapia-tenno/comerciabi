-- ComercioBI
-- Migración 011: proveedores, compras y recepción de mercadería
-- Requiere las migraciones 001 a 010.
-- Ejecutar una sola vez en Supabase SQL Editor.

-- El valor se agrega antes de la transacción para poder utilizarlo
-- inmediatamente en funciones y restricciones posteriores.
alter type public.tipo_movimiento_enum
  add value if not exists 'REVERSA_COMPRA';

-- Crea el tipo de estado de compra si todavía no existe.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'estado_compra_enum'
  ) then
    create type public.estado_compra_enum as enum (
      'BORRADOR',
      'CONFIRMADA',
      'ANULADA'
    );
  end if;
end;
$$;

begin;

-- 1. Maestro de proveedores.
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  tipo_documento public.tipo_documento_enum,
  numero_documento varchar(30),
  razon_social varchar(200) not null,
  nombre_comercial varchar(200),
  email varchar(254),
  telefono varchar(30),
  contacto_nombre varchar(150),
  direccion text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_proveedores_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint ck_proveedores_razon_social
    check (btrim(razon_social) <> ''),
  constraint ck_proveedores_documento_completo
    check (
      (tipo_documento is null and numero_documento is null)
      or
      (tipo_documento is not null and numero_documento is not null)
    ),
  constraint ck_proveedores_numero_documento
    check (numero_documento is null or btrim(numero_documento) <> ''),
  constraint ck_proveedores_email
    check (email is null or btrim(email) <> ''),
  constraint uq_proveedores_documento
    unique (empresa_id, tipo_documento, numero_documento),
  constraint uq_proveedores_id_empresa
    unique (id, empresa_id)
);

-- 2. Encabezado de compras.
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  codigo varchar(40) not null,
  proveedor_id uuid not null,
  comprador_empresa_id uuid not null,
  almacen_id uuid not null,
  fecha_compra timestamptz not null default now(),
  estado public.estado_compra_enum not null default 'BORRADOR',
  subtotal numeric(14,2) not null default 0,
  descuento_total numeric(14,2) not null default 0,
  tasa_impuesto numeric(5,4) not null default 0.1800,
  impuesto_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  moneda varchar(3) not null default 'PEN',
  numero_comprobante varchar(60),
  observaciones text,
  motivo_anulacion text,
  confirmada_at timestamptz,
  confirmada_por uuid,
  anulada_at timestamptz,
  anulada_por uuid,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_compras_empresa
    foreign key (empresa_id)
    references public.empresas(id)
    on delete restrict,
  constraint fk_compras_proveedor_empresa
    foreign key (proveedor_id, empresa_id)
    references public.proveedores(id, empresa_id)
    on delete restrict,
  constraint fk_compras_comprador_empresa
    foreign key (comprador_empresa_id, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint fk_compras_almacen_empresa
    foreign key (almacen_id, empresa_id)
    references public.almacenes(id, empresa_id)
    on delete restrict,
  constraint fk_compras_confirmada_por_empresa
    foreign key (confirmada_por, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint fk_compras_anulada_por_empresa
    foreign key (anulada_por, empresa_id)
    references public.usuarios_empresa(id, empresa_id)
    on delete restrict,
  constraint ck_compras_codigo
    check (btrim(codigo) <> ''),
  constraint ck_compras_importes
    check (
      subtotal >= 0
      and descuento_total >= 0
      and descuento_total <= subtotal
      and impuesto_total >= 0
      and total >= 0
    ),
  constraint ck_compras_tasa_impuesto
    check (tasa_impuesto between 0 and 1),
  constraint ck_compras_moneda
    check (moneda ~ '^[A-Z]{3}$'),
  constraint ck_compras_comprobante
    check (numero_comprobante is null or btrim(numero_comprobante) <> ''),
  constraint ck_compras_confirmacion
    check (estado <> 'CONFIRMADA' or confirmada_at is not null),
  constraint ck_compras_anulacion
    check (
      estado <> 'ANULADA'
      or (
        confirmada_at is not null
        and anulada_at is not null
        and motivo_anulacion is not null
        and btrim(motivo_anulacion) <> ''
      )
    ),
  constraint uq_compras_empresa_codigo
    unique (empresa_id, codigo),
  constraint uq_compras_id_empresa
    unique (id, empresa_id)
);

-- 3. Detalle de compras.
create table public.detalle_compra (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null,
  producto_id uuid not null,
  cantidad numeric(14,3) not null,
  costo_unitario numeric(14,2) not null,
  subtotal_linea numeric(14,2)
    generated always as (round(cantidad * costo_unitario, 2)) stored,
  descuento_linea numeric(14,2) not null default 0,
  total_linea numeric(14,2)
    generated always as (
      round(cantidad * costo_unitario, 2) - descuento_linea
    ) stored,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  constraint fk_detalle_compra
    foreign key (compra_id)
    references public.compras(id)
    on delete cascade,
  constraint fk_detalle_compra_producto
    foreign key (producto_id)
    references public.productos(id)
    on delete restrict,
  constraint ck_detalle_compra_cantidad
    check (cantidad > 0),
  constraint ck_detalle_compra_costo
    check (costo_unitario >= 0),
  constraint ck_detalle_compra_descuento
    check (
      descuento_linea >= 0
      and descuento_linea <= round(cantidad * costo_unitario, 2)
    ),
  constraint uq_detalle_compra_producto
    unique (compra_id, producto_id)
);

-- 4. Enlaza el Kardex con compras.
alter table public.movimientos_inventario
  add column compra_id uuid;

alter table public.movimientos_inventario
  add constraint fk_movimientos_compra_empresa
  foreign key (compra_id, empresa_id)
  references public.compras(id, empresa_id)
  on delete restrict;

-- 5. Triggers de actualizado_at.
create trigger trg_proveedores_actualizado_at
before update on public.proveedores
for each row execute function public.establecer_actualizado_at();

create trigger trg_compras_actualizado_at
before update on public.compras
for each row execute function public.establecer_actualizado_at();

create trigger trg_detalle_compra_actualizado_at
before update on public.detalle_compra
for each row execute function public.establecer_actualizado_at();

-- 6. Verifica que el detalle y la compra pertenezcan a la misma empresa.
create or replace function public.validar_detalle_compra_misma_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_empresa_compra uuid;
  v_empresa_producto uuid;
begin
  select empresa_id into v_empresa_compra
  from public.compras
  where id = new.compra_id;

  select empresa_id into v_empresa_producto
  from public.productos
  where id = new.producto_id;

  if v_empresa_compra is not null
     and v_empresa_producto is not null
     and v_empresa_compra <> v_empresa_producto then
    raise exception 'El producto y la compra deben pertenecer a la misma empresa.';
  end if;

  return new;
end;
$$;

create trigger trg_validar_detalle_compra_empresa
before insert or update of compra_id, producto_id
on public.detalle_compra
for each row execute function public.validar_detalle_compra_misma_empresa();

-- 7. Solo permite modificar detalles de compras en BORRADOR.
create or replace function public.validar_compra_editable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_compra_id uuid;
  v_estado public.estado_compra_enum;
begin
  if tg_op = 'DELETE' then
    v_compra_id := old.compra_id;
  else
    v_compra_id := new.compra_id;
  end if;

  select estado into v_estado
  from public.compras
  where id = v_compra_id;

  if v_estado is not null and v_estado <> 'BORRADOR' then
    raise exception 'Solo se pueden modificar detalles de compras en estado BORRADOR.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger trg_validar_compra_editable
before insert or update or delete
on public.detalle_compra
for each row execute function public.validar_compra_editable();

-- 8. Recalcula importes del encabezado.
create or replace function public.recalcular_una_compra(p_compra_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  with totales as (
    select
      coalesce(sum(d.subtotal_linea), 0)::numeric(14,2) as subtotal,
      coalesce(sum(d.descuento_linea), 0)::numeric(14,2) as descuento
    from public.detalle_compra d
    where d.compra_id = p_compra_id
  )
  update public.compras c
  set
    subtotal = t.subtotal,
    descuento_total = t.descuento,
    impuesto_total = round(
      (t.subtotal - t.descuento) * c.tasa_impuesto,
      2
    ),
    total = round(
      (t.subtotal - t.descuento)
      + ((t.subtotal - t.descuento) * c.tasa_impuesto),
      2
    )
  from totales t
  where c.id = p_compra_id;
end;
$$;

create or replace function public.recalcular_compra_desde_detalle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_una_compra(old.compra_id);
    return old;
  end if;

  perform public.recalcular_una_compra(new.compra_id);
  return new;
end;
$$;

create trigger trg_recalcular_compra
after insert or update or delete
on public.detalle_compra
for each row execute function public.recalcular_compra_desde_detalle();

-- 9. Funciones de autorización de lectura y edición.
create or replace function public.puede_ver_compra(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.compras c
    where c.id = p_compra_id
      and public.es_miembro_empresa(c.empresa_id)
  );
$$;

create or replace function public.puede_editar_compra_borrador(p_compra_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.compras c
    where c.id = p_compra_id
      and c.estado = 'BORRADOR'
      and public.tiene_rol(
        c.empresa_id,
        array['ADMIN', 'ALMACEN']::public.rol_empresa_enum[]
      )
  );
$$;

-- 10. Código correlativo por empresa y día.
create or replace function public.generar_codigo_compra_interno(
  p_empresa_id uuid,
  p_fecha_compra timestamptz
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
  select e.zona_horaria into v_zona_horaria
  from public.empresas e
  where e.id = p_empresa_id
    and e.activo = true;

  if v_zona_horaria is null then
    raise exception 'La empresa no existe o está inactiva.';
  end if;

  v_prefijo := 'C-'
    || to_char(
      coalesce(p_fecha_compra, now()) at time zone v_zona_horaria,
      'YYYYMMDD'
    )
    || '-';

  perform pg_advisory_xact_lock(
    hashtextextended(p_empresa_id::text || ':' || v_prefijo, 0)
  );

  select coalesce(
    max(substring(c.codigo from char_length(v_prefijo) + 1)::integer),
    0
  ) + 1
  into v_correlativo
  from public.compras c
  where c.empresa_id = p_empresa_id
    and c.codigo like v_prefijo || '%'
    and substring(c.codigo from char_length(v_prefijo) + 1) ~ '^[0-9]+$';

  return v_prefijo || lpad(v_correlativo::text, 4, '0');
end;
$$;

-- 11. Guarda encabezado y detalles del borrador en una sola transacción.
create or replace function public.guardar_compra_borrador(
  p_compra_id uuid,
  p_empresa_id uuid,
  p_proveedor_id uuid,
  p_almacen_id uuid,
  p_fecha_compra timestamptz,
  p_numero_comprobante text,
  p_observaciones text,
  p_detalles jsonb
)
returns table (
  compra_id uuid,
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
  v_compra public.compras%rowtype;
  v_codigo text;
  v_total_detalles integer;
  v_productos_distintos integer;
  v_productos_validos integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para registrar una compra.';
  end if;

  select ue.id, ue.rol
  into v_membresia_id, v_rol
  from public.usuarios_empresa ue
  join public.perfiles p on p.id = ue.perfil_id
  where ue.empresa_id = p_empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null
     or v_rol not in ('ADMIN', 'ALMACEN') then
    raise exception 'Tu rol no puede registrar compras.';
  end if;

  select e.tasa_impuesto, e.moneda
  into v_tasa_impuesto, v_moneda
  from public.empresas e
  where e.id = p_empresa_id
    and e.activo = true;

  if v_tasa_impuesto is null then
    raise exception 'La empresa no existe o se encuentra inactiva.';
  end if;

  if not exists (
    select 1
    from public.proveedores p
    where p.id = p_proveedor_id
      and p.empresa_id = p_empresa_id
      and p.activo = true
  ) then
    raise exception 'Selecciona un proveedor activo de la empresa.';
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

  if p_detalles is null
     or jsonb_typeof(p_detalles) <> 'array'
     or jsonb_array_length(p_detalles) = 0 then
    raise exception 'La compra debe incluir al menos un producto.';
  end if;

  select count(*), count(distinct d.producto_id)
  into v_total_detalles, v_productos_distintos
  from jsonb_to_recordset(p_detalles) as d(
    producto_id uuid,
    cantidad numeric,
    costo_unitario numeric,
    descuento_linea numeric
  );

  if v_total_detalles <> v_productos_distintos then
    raise exception 'No se puede repetir un producto dentro de la compra.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_detalles) as d(
      producto_id uuid,
      cantidad numeric,
      costo_unitario numeric,
      descuento_linea numeric
    )
    where d.producto_id is null
      or d.cantidad is null
      or d.cantidad <= 0
      or d.costo_unitario is null
      or d.costo_unitario < 0
      or coalesce(d.descuento_linea, 0) < 0
      or coalesce(d.descuento_linea, 0)
        > round(d.cantidad * d.costo_unitario, 2)
  ) then
    raise exception 'Uno o más detalles contienen cantidades, costos o descuentos inválidos.';
  end if;

  select count(*) into v_productos_validos
  from public.productos p
  join (
    select distinct d.producto_id
    from jsonb_to_recordset(p_detalles) as d(
      producto_id uuid,
      cantidad numeric,
      costo_unitario numeric,
      descuento_linea numeric
    )
  ) seleccion on seleccion.producto_id = p.id
  where p.empresa_id = p_empresa_id
    and p.activo = true;

  if v_productos_validos <> v_total_detalles then
    raise exception 'La compra contiene productos inexistentes o inactivos.';
  end if;

  if p_compra_id is null then
    v_codigo := public.generar_codigo_compra_interno(
      p_empresa_id,
      coalesce(p_fecha_compra, now())
    );

    insert into public.compras (
      empresa_id,
      codigo,
      proveedor_id,
      comprador_empresa_id,
      almacen_id,
      fecha_compra,
      estado,
      tasa_impuesto,
      moneda,
      numero_comprobante,
      observaciones
    ) values (
      p_empresa_id,
      v_codigo,
      p_proveedor_id,
      v_membresia_id,
      p_almacen_id,
      coalesce(p_fecha_compra, now()),
      'BORRADOR',
      v_tasa_impuesto,
      v_moneda,
      nullif(btrim(p_numero_comprobante), ''),
      nullif(btrim(p_observaciones), '')
    )
    returning * into v_compra;
  else
    select c.* into v_compra
    from public.compras c
    where c.id = p_compra_id
    for update;

    if v_compra.id is null then
      raise exception 'La compra indicada no existe.';
    end if;

    if v_compra.empresa_id <> p_empresa_id then
      raise exception 'La compra no pertenece a la empresa activa.';
    end if;

    if v_compra.estado <> 'BORRADOR' then
      raise exception 'Solo se pueden editar compras en estado BORRADOR.';
    end if;

    update public.compras c
    set
      proveedor_id = p_proveedor_id,
      almacen_id = p_almacen_id,
      fecha_compra = coalesce(p_fecha_compra, c.fecha_compra),
      tasa_impuesto = v_tasa_impuesto,
      moneda = v_moneda,
      numero_comprobante = nullif(btrim(p_numero_comprobante), ''),
      observaciones = nullif(btrim(p_observaciones), '')
    where c.id = p_compra_id
    returning * into v_compra;

    delete from public.detalle_compra d
    where d.compra_id = p_compra_id;
  end if;

  insert into public.detalle_compra (
    compra_id,
    producto_id,
    cantidad,
    costo_unitario,
    descuento_linea
  )
  select
    v_compra.id,
    d.producto_id,
    round(d.cantidad, 3),
    round(d.costo_unitario, 2),
    round(coalesce(d.descuento_linea, 0), 2)
  from jsonb_to_recordset(p_detalles) as d(
    producto_id uuid,
    cantidad numeric,
    costo_unitario numeric,
    descuento_linea numeric
  );

  return query
  select
    c.id,
    c.codigo::text,
    c.subtotal,
    c.descuento_total,
    c.impuesto_total,
    c.total
  from public.compras c
  where c.id = v_compra.id;
end;
$$;

-- 12. Confirma la recepción y aumenta el stock.
create or replace function public.confirmar_compra(p_compra_id uuid)
returns table (
  compra_id uuid,
  codigo text,
  estado public.estado_compra_enum,
  total numeric,
  confirmada_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra public.compras%rowtype;
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_producto_problema text;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para confirmar una compra.';
  end if;

  select c.* into v_compra
  from public.compras c
  where c.id = p_compra_id
  for update;

  if v_compra.id is null then
    raise exception 'La compra indicada no existe.';
  end if;

  select ue.id, ue.rol
  into v_membresia_id, v_rol
  from public.usuarios_empresa ue
  join public.perfiles p on p.id = ue.perfil_id
  where ue.empresa_id = v_compra.empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null
     or v_rol not in ('ADMIN', 'ALMACEN') then
    raise exception 'Tu rol no puede confirmar compras.';
  end if;

  if v_compra.estado <> 'BORRADOR' then
    raise exception 'Solo se pueden confirmar compras en estado BORRADOR.';
  end if;

  if not exists (
    select 1 from public.detalle_compra d
    where d.compra_id = p_compra_id
  ) then
    raise exception 'La compra no tiene productos para confirmar.';
  end if;

  perform e.id
  from public.existencias_producto e
  join public.detalle_compra d
    on d.producto_id = e.producto_id
   and d.compra_id = p_compra_id
  where e.almacen_id = v_compra.almacen_id
  order by e.id
  for update of e;

  select p.nombre into v_producto_problema
  from public.detalle_compra d
  join public.productos p on p.id = d.producto_id
  left join public.existencias_producto e
    on e.almacen_id = v_compra.almacen_id
   and e.producto_id = d.producto_id
  where d.compra_id = p_compra_id
    and e.id is null
  order by p.nombre
  limit 1;

  if v_producto_problema is not null then
    raise exception 'No existe una configuración de stock para el producto: %.',
      v_producto_problema;
  end if;

  insert into public.movimientos_inventario (
    empresa_id,
    almacen_id,
    producto_id,
    venta_id,
    compra_id,
    usuario_empresa_id,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_resultante,
    motivo
  )
  select
    v_compra.empresa_id,
    v_compra.almacen_id,
    e.producto_id,
    null,
    v_compra.id,
    v_membresia_id,
    'ENTRADA',
    d.cantidad,
    e.stock_actual,
    e.stock_actual + d.cantidad,
    'Recepción de compra ' || v_compra.codigo
  from public.existencias_producto e
  join public.detalle_compra d
    on d.producto_id = e.producto_id
   and d.compra_id = p_compra_id
  where e.almacen_id = v_compra.almacen_id;

  update public.existencias_producto e
  set stock_actual = e.stock_actual + d.cantidad
  from public.detalle_compra d
  where d.compra_id = p_compra_id
    and e.almacen_id = v_compra.almacen_id
    and e.producto_id = d.producto_id;

  update public.compras c
  set
    estado = 'CONFIRMADA',
    confirmada_at = now(),
    confirmada_por = v_membresia_id,
    motivo_anulacion = null,
    anulada_at = null,
    anulada_por = null
  where c.id = p_compra_id
  returning * into v_compra;

  return query
  select
    v_compra.id,
    v_compra.codigo::text,
    v_compra.estado,
    v_compra.total,
    v_compra.confirmada_at;
end;
$$;

-- 13. Anula una compra confirmada y revierte el stock, si todavía existe.
create or replace function public.anular_compra(
  p_compra_id uuid,
  p_motivo text
)
returns table (
  compra_id uuid,
  codigo text,
  estado public.estado_compra_enum,
  total numeric,
  anulada_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra public.compras%rowtype;
  v_membresia_id uuid;
  v_rol public.rol_empresa_enum;
  v_producto_problema text;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para anular una compra.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Ingresa el motivo de anulación.';
  end if;

  select c.* into v_compra
  from public.compras c
  where c.id = p_compra_id
  for update;

  if v_compra.id is null then
    raise exception 'La compra indicada no existe.';
  end if;

  select ue.id, ue.rol
  into v_membresia_id, v_rol
  from public.usuarios_empresa ue
  join public.perfiles p on p.id = ue.perfil_id
  where ue.empresa_id = v_compra.empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
  limit 1;

  if v_membresia_id is null or v_rol <> 'ADMIN' then
    raise exception 'Solo un administrador puede anular compras confirmadas.';
  end if;

  if v_compra.estado <> 'CONFIRMADA' then
    raise exception 'Solo se pueden anular compras confirmadas.';
  end if;

  perform e.id
  from public.existencias_producto e
  join public.detalle_compra d
    on d.producto_id = e.producto_id
   and d.compra_id = p_compra_id
  where e.almacen_id = v_compra.almacen_id
  order by e.id
  for update of e;

  select p.nombre into v_producto_problema
  from public.detalle_compra d
  join public.productos p on p.id = d.producto_id
  join public.existencias_producto e
    on e.almacen_id = v_compra.almacen_id
   and e.producto_id = d.producto_id
  where d.compra_id = p_compra_id
    and e.stock_actual < d.cantidad
  order by p.nombre
  limit 1;

  if v_producto_problema is not null then
    raise exception 'No se puede anular: el stock disponible de % ya es menor que la cantidad recibida.',
      v_producto_problema;
  end if;

  insert into public.movimientos_inventario (
    empresa_id,
    almacen_id,
    producto_id,
    venta_id,
    compra_id,
    usuario_empresa_id,
    tipo_movimiento,
    cantidad,
    stock_anterior,
    stock_resultante,
    motivo
  )
  select
    v_compra.empresa_id,
    v_compra.almacen_id,
    e.producto_id,
    null,
    v_compra.id,
    v_membresia_id,
    'REVERSA_COMPRA',
    d.cantidad,
    e.stock_actual,
    e.stock_actual - d.cantidad,
    'Anulación de compra ' || v_compra.codigo || ': ' || btrim(p_motivo)
  from public.existencias_producto e
  join public.detalle_compra d
    on d.producto_id = e.producto_id
   and d.compra_id = p_compra_id
  where e.almacen_id = v_compra.almacen_id;

  update public.existencias_producto e
  set stock_actual = e.stock_actual - d.cantidad
  from public.detalle_compra d
  where d.compra_id = p_compra_id
    and e.almacen_id = v_compra.almacen_id
    and e.producto_id = d.producto_id;

  update public.compras c
  set
    estado = 'ANULADA',
    motivo_anulacion = btrim(p_motivo),
    anulada_at = now(),
    anulada_por = v_membresia_id
  where c.id = p_compra_id
  returning * into v_compra;

  return query
  select
    v_compra.id,
    v_compra.codigo::text,
    v_compra.estado,
    v_compra.total,
    v_compra.anulada_at;
end;
$$;

-- 14. Índices operativos.
create unique index uq_proveedores_empresa_razon_social_ci
on public.proveedores (empresa_id, lower(btrim(razon_social)));

create index idx_proveedores_empresa_activo
on public.proveedores (empresa_id, activo, razon_social);

create index idx_compras_empresa_fecha
on public.compras (empresa_id, fecha_compra desc);

create index idx_compras_estado
on public.compras (empresa_id, estado, fecha_compra desc);

create index idx_compras_proveedor
on public.compras (proveedor_id, fecha_compra desc);

create index idx_detalle_compra_compra
on public.detalle_compra (compra_id);

create index idx_movimientos_compra
on public.movimientos_inventario (compra_id)
where compra_id is not null;

-- 15. RLS y privilegios.
alter table public.proveedores enable row level security;
alter table public.compras enable row level security;
alter table public.detalle_compra enable row level security;

revoke all on table
  public.proveedores,
  public.compras,
  public.detalle_compra
from anon;

grant select on table
  public.proveedores,
  public.compras,
  public.detalle_compra
to authenticated;

grant insert on public.proveedores to authenticated;
grant update (
  tipo_documento,
  numero_documento,
  razon_social,
  nombre_comercial,
  email,
  telefono,
  contacto_nombre,
  direccion,
  activo
) on public.proveedores to authenticated;

grant delete on public.compras to authenticated;

create policy proveedores_select_miembros
on public.proveedores
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy proveedores_insert_operativos
on public.proveedores
for insert
to authenticated
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'ALMACEN']::public.rol_empresa_enum[]
  )
);

create policy proveedores_update_operativos
on public.proveedores
for update
to authenticated
using (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'ALMACEN']::public.rol_empresa_enum[]
  )
)
with check (
  public.tiene_rol(
    empresa_id,
    array['ADMIN', 'ALMACEN']::public.rol_empresa_enum[]
  )
);

create policy compras_select_miembros
on public.compras
for select
to authenticated
using (public.es_miembro_empresa(empresa_id));

create policy compras_delete_borrador
on public.compras
for delete
to authenticated
using (public.puede_editar_compra_borrador(id));

create policy detalle_compra_select_miembros
on public.detalle_compra
for select
to authenticated
using (public.puede_ver_compra(compra_id));

-- 16. Permisos de funciones.
revoke all on function public.validar_detalle_compra_misma_empresa()
from public, anon, authenticated;
revoke all on function public.validar_compra_editable()
from public, anon, authenticated;
revoke all on function public.recalcular_una_compra(uuid)
from public, anon, authenticated;
revoke all on function public.recalcular_compra_desde_detalle()
from public, anon, authenticated;
revoke all on function public.generar_codigo_compra_interno(uuid, timestamptz)
from public, anon, authenticated;

revoke all on function public.guardar_compra_borrador(
  uuid, uuid, uuid, uuid, timestamptz, text, text, jsonb
) from public, anon;
grant execute on function public.guardar_compra_borrador(
  uuid, uuid, uuid, uuid, timestamptz, text, text, jsonb
) to authenticated;

revoke all on function public.confirmar_compra(uuid)
from public, anon;
grant execute on function public.confirmar_compra(uuid)
to authenticated;

revoke all on function public.anular_compra(uuid, text)
from public, anon;
grant execute on function public.anular_compra(uuid, text)
to authenticated;

revoke all on function public.puede_ver_compra(uuid)
from public, anon;
grant execute on function public.puede_ver_compra(uuid)
to authenticated;

revoke all on function public.puede_editar_compra_borrador(uuid)
from public, anon;
grant execute on function public.puede_editar_compra_borrador(uuid)
to authenticated;

commit;

notify pgrst, 'reload schema';
