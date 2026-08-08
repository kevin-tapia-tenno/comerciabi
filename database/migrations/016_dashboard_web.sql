-- ComercioBI
-- Migración 016: dashboard web analítico
-- Requiere las migraciones 001 a 015.
-- Ejecutar una sola vez en Supabase SQL Editor.

begin;

create or replace function public.obtener_dashboard_comercial(
  p_empresa_id uuid,
  p_fecha_desde date,
  p_fecha_hasta date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_empresa_enum;
  v_zona_horaria text;
  v_desde_ts timestamptz;
  v_hasta_exclusivo_ts timestamptz;
  v_resultado jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Debes iniciar sesión para consultar el dashboard.';
  end if;

  if p_empresa_id is null then
    raise exception 'La empresa es obligatoria.';
  end if;

  if p_fecha_desde is null or p_fecha_hasta is null then
    raise exception 'Debes indicar una fecha inicial y una fecha final.';
  end if;

  if p_fecha_desde > p_fecha_hasta then
    raise exception 'La fecha inicial no puede ser posterior a la fecha final.';
  end if;

  select
    ue.rol,
    e.zona_horaria
  into
    v_rol,
    v_zona_horaria
  from public.usuarios_empresa ue
  join public.perfiles p
    on p.id = ue.perfil_id
  join public.empresas e
    on e.id = ue.empresa_id
  where ue.empresa_id = p_empresa_id
    and ue.perfil_id = (select auth.uid())
    and ue.activo = true
    and p.activo = true
    and e.activo = true
  limit 1;

  if v_rol is null then
    raise exception 'No tienes una membresía activa en la empresa seleccionada.';
  end if;

  if v_rol not in ('ADMIN', 'GERENTE', 'ANALISTA') then
    raise exception 'Tu rol no puede consultar los reportes analíticos.';
  end if;

  -- Las fechas elegidas por el usuario se interpretan usando la zona horaria
  -- configurada en la empresa. El límite superior es exclusivo para incluir
  -- completamente el día p_fecha_hasta.
  v_desde_ts := p_fecha_desde::timestamp at time zone v_zona_horaria;
  v_hasta_exclusivo_ts :=
    (p_fecha_hasta + 1)::timestamp at time zone v_zona_horaria;

  with
  ventas_periodo as (
    select
      v.id,
      v.codigo,
      v.cliente_id,
      v.vendedor_empresa_id,
      v.canal_venta_id,
      v.fecha_venta,
      v.subtotal,
      v.descuento_total,
      v.impuesto_total,
      v.total,
      v.moneda
    from public.ventas v
    where v.empresa_id = p_empresa_id
      and v.estado = 'CONFIRMADA'
      and v.fecha_venta >= v_desde_ts
      and v.fecha_venta < v_hasta_exclusivo_ts
  ),
  detalle_periodo as (
    select
      d.venta_id,
      d.producto_id,
      d.cantidad,
      d.precio_unitario,
      d.costo_unitario,
      d.descuento_linea,
      d.total_linea,
      v.fecha_venta,
      v.cliente_id,
      v.vendedor_empresa_id,
      v.canal_venta_id
    from public.detalle_venta d
    join ventas_periodo v
      on v.id = d.venta_id
  ),
  resumen_ventas as (
    select
      count(*)::integer as ventas_confirmadas,
      coalesce(sum(v.total), 0)::numeric as facturacion_total,
      count(distinct v.cliente_id)::integer as clientes_compradores
    from ventas_periodo v
  ),
  resumen_detalle as (
    select
      coalesce(sum(d.total_linea), 0)::numeric as ventas_netas,
      coalesce(
        sum(
          d.total_linea
          - round(d.cantidad * d.costo_unitario, 2)
        ),
        0
      )::numeric as utilidad_bruta,
      count(distinct d.producto_id)::integer as productos_vendidos,
      coalesce(sum(d.cantidad), 0)::numeric as unidades_vendidas
    from detalle_periodo d
  ),
  resumen_inventario as (
    select
      count(*) filter (
        where e.stock_minimo > 0
          and e.stock_actual <= e.stock_minimo
      )::integer as posiciones_stock_critico,
      count(*) filter (
        where e.stock_actual <= 0
      )::integer as posiciones_agotadas,
      coalesce(
        sum(e.stock_actual * p.costo_actual),
        0
      )::numeric as valor_inventario
    from public.existencias_producto e
    join public.productos p
      on p.id = e.producto_id
    join public.almacenes a
      on a.id = e.almacen_id
    where p.empresa_id = p_empresa_id
      and a.empresa_id = p_empresa_id
      and p.activo = true
      and a.activo = true
  ),
  meses as (
    select
      generate_series(
        date_trunc('month', p_fecha_desde::timestamp),
        date_trunc('month', p_fecha_hasta::timestamp),
        interval '1 month'
      )::date as mes
  ),
  ventas_mes as (
    select
      date_trunc(
        'month',
        v.fecha_venta at time zone v_zona_horaria
      )::date as mes,
      count(*)::integer as operaciones,
      coalesce(sum(v.total), 0)::numeric as facturacion
    from ventas_periodo v
    group by 1
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'desde', p_fecha_desde,
      'hasta', p_fecha_hasta
    ),
    'resumen', jsonb_build_object(
      'facturacion_total', round(rv.facturacion_total, 2),
      'ventas_confirmadas', rv.ventas_confirmadas,
      'ventas_netas', round(rd.ventas_netas, 2),
      'utilidad_bruta', round(rd.utilidad_bruta, 2),
      'margen_bruto_pct',
        case
          when rd.ventas_netas > 0 then
            round((rd.utilidad_bruta / rd.ventas_netas) * 100, 2)
          else 0
        end,
      'ticket_promedio',
        case
          when rv.ventas_confirmadas > 0 then
            round(rv.facturacion_total / rv.ventas_confirmadas, 2)
          else 0
        end,
      'clientes_compradores', rv.clientes_compradores,
      'productos_vendidos', rd.productos_vendidos,
      'unidades_vendidas', round(rd.unidades_vendidas, 3),
      'posiciones_stock_critico', ri.posiciones_stock_critico,
      'posiciones_agotadas', ri.posiciones_agotadas,
      'valor_inventario', round(ri.valor_inventario, 2)
    ),
    'ventas_mensuales',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'mes', m.mes,
              'facturacion', round(coalesce(vm.facturacion, 0), 2),
              'operaciones', coalesce(vm.operaciones, 0)
            )
            order by m.mes
          )
          from meses m
          left join ventas_mes vm
            on vm.mes = m.mes
        ),
        '[]'::jsonb
      ),
    'ventas_categoria',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x) order by x.ventas_netas desc)
          from (
            select
              c.nombre as categoria,
              round(sum(d.total_linea), 2) as ventas_netas,
              round(sum(d.cantidad), 3) as unidades
            from detalle_periodo d
            join public.productos p
              on p.id = d.producto_id
            join public.categorias c
              on c.id = p.categoria_id
            group by c.id, c.nombre
            order by sum(d.total_linea) desc, c.nombre
            limit 8
          ) x
        ),
        '[]'::jsonb
      ),
    'ventas_canal',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x) order by x.facturacion desc)
          from (
            select
              cv.nombre as canal,
              round(sum(v.total), 2) as facturacion,
              count(*)::integer as operaciones
            from ventas_periodo v
            join public.canales_venta cv
              on cv.id = v.canal_venta_id
            group by cv.id, cv.nombre
            order by sum(v.total) desc, cv.nombre
          ) x
        ),
        '[]'::jsonb
      ),
    'ventas_vendedor',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x) order by x.facturacion desc)
          from (
            select
              ue.id as vendedor_empresa_id,
              concat_ws(' ', pf.nombres, pf.apellidos) as vendedor,
              round(sum(v.total), 2) as facturacion,
              count(*)::integer as operaciones
            from ventas_periodo v
            join public.usuarios_empresa ue
              on ue.id = v.vendedor_empresa_id
            join public.perfiles pf
              on pf.id = ue.perfil_id
            group by ue.id, pf.nombres, pf.apellidos
            order by sum(v.total) desc, vendedor
          ) x
        ),
        '[]'::jsonb
      ),
    'top_productos',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x) order by x.ventas_netas desc)
          from (
            select
              p.id as producto_id,
              p.sku,
              p.nombre as producto,
              round(sum(d.cantidad), 3) as cantidad,
              round(sum(d.total_linea), 2) as ventas_netas,
              round(
                sum(
                  d.total_linea
                  - round(d.cantidad * d.costo_unitario, 2)
                ),
                2
              ) as utilidad_bruta
            from detalle_periodo d
            join public.productos p
              on p.id = d.producto_id
            group by p.id, p.sku, p.nombre
            order by sum(d.total_linea) desc, p.nombre
            limit 10
          ) x
        ),
        '[]'::jsonb
      ),
    'stock_critico',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(x)
            order by
              x.agotado desc,
              x.stock_actual asc,
              x.producto
          )
          from (
            select
              p.id as producto_id,
              p.sku,
              p.nombre as producto,
              a.id as almacen_id,
              a.nombre as almacen,
              round(e.stock_actual, 3) as stock_actual,
              round(e.stock_minimo, 3) as stock_minimo,
              (e.stock_actual <= 0) as agotado
            from public.existencias_producto e
            join public.productos p
              on p.id = e.producto_id
            join public.almacenes a
              on a.id = e.almacen_id
            where p.empresa_id = p_empresa_id
              and a.empresa_id = p_empresa_id
              and p.activo = true
              and a.activo = true
              and e.stock_minimo > 0
              and e.stock_actual <= e.stock_minimo
            order by
              (e.stock_actual <= 0) desc,
              e.stock_actual asc,
              p.nombre
            limit 10
          ) x
        ),
        '[]'::jsonb
      ),
    'ultimas_ventas',
      coalesce(
        (
          select jsonb_agg(to_jsonb(x) order by x.fecha_venta desc)
          from (
            select
              v.id,
              v.codigo,
              v.fecha_venta,
              c.nombre_completo as cliente,
              concat_ws(' ', pf.nombres, pf.apellidos) as vendedor,
              cv.nombre as canal,
              round(v.total, 2) as total,
              v.moneda
            from ventas_periodo v
            join public.clientes c
              on c.id = v.cliente_id
            join public.usuarios_empresa ue
              on ue.id = v.vendedor_empresa_id
            join public.perfiles pf
              on pf.id = ue.perfil_id
            join public.canales_venta cv
              on cv.id = v.canal_venta_id
            order by v.fecha_venta desc, v.id desc
            limit 10
          ) x
        ),
        '[]'::jsonb
      )
  )
  into v_resultado
  from resumen_ventas rv
  cross join resumen_detalle rd
  cross join resumen_inventario ri;

  return v_resultado;
end;
$$;

revoke all on function public.obtener_dashboard_comercial(
  uuid,
  date,
  date
) from public, anon;

grant execute on function public.obtener_dashboard_comercial(
  uuid,
  date,
  date
) to authenticated;

comment on function public.obtener_dashboard_comercial(uuid, date, date)
is 'Devuelve los indicadores y series del dashboard comercial para ADMIN, GERENTE y ANALISTA de una empresa activa.';

commit;
