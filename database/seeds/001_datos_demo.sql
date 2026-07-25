-- ComercioBI
-- Datos iniciales de demostración
-- Ejecutar después de las cinco migraciones.
-- Este archivo es idempotente: puede ejecutarse nuevamente.

begin;

-- Empresa de demostración
insert into public.empresas (
  id,
  nombre,
  razon_social,
  ruc,
  moneda,
  zona_horaria,
  tasa_impuesto,
  activo
)
values (
  '00000000-0000-0000-0000-000000000001',
  'Distribuidora Nova',
  'Distribuidora Nova S.A.C. - Empresa de demostración',
  null,
  'PEN',
  'America/Lima',
  0.1800,
  true
)
on conflict (id) do nothing;

-- Categorías
insert into public.categorias (
  id,
  empresa_id,
  nombre,
  descripcion
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Oficina',
    'Artículos y suministros de oficina'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Tecnología',
    'Accesorios y equipos tecnológicos'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Limpieza',
    'Productos de limpieza y mantenimiento'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'Almacenamiento',
    'Productos para organización y archivo'
  )
on conflict (id) do nothing;

-- Almacén principal
insert into public.almacenes (
  id,
  empresa_id,
  nombre,
  descripcion,
  es_principal
)
values (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Almacén principal',
  'Almacén inicial de la empresa de demostración',
  true
)
on conflict (id) do nothing;

-- Canales de venta
insert into public.canales_venta (
  id,
  empresa_id,
  nombre,
  descripcion
)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Tienda',
    'Venta realizada en el local'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Web',
    'Venta originada desde la página web'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Teléfono',
    'Venta coordinada por llamada'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'Corporativo',
    'Venta a clientes empresariales'
  )
on conflict (id) do nothing;

-- Cliente genérico
insert into public.clientes (
  id,
  empresa_id,
  tipo_cliente,
  nombre_completo,
  segmento
)
values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'PERSONA',
  'Público general',
  'MINORISTA'
)
on conflict (id) do nothing;

-- Productos de demostración
insert into public.productos (
  id,
  empresa_id,
  categoria_id,
  sku,
  nombre,
  descripcion,
  unidad_medida,
  costo_actual,
  precio_venta
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'OFI-001',
    'Papel bond A4',
    'Paquete de 500 hojas',
    'PAQUETE',
    15.00,
    21.90
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'OFI-002',
    'Lapicero azul',
    'Lapicero de tinta azul',
    'UNIDAD',
    0.70,
    1.50
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'TEC-001',
    'Mouse inalámbrico',
    'Mouse óptico con receptor USB',
    'UNIDAD',
    28.00,
    45.90
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'TEC-002',
    'Teclado USB',
    'Teclado de tamaño completo',
    'UNIDAD',
    35.00,
    59.90
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'LIM-001',
    'Alcohol de limpieza',
    'Botella de un litro',
    'LITRO',
    8.50,
    13.90
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000003',
    'LIM-002',
    'Paño de microfibra',
    'Paño multiuso',
    'UNIDAD',
    2.50,
    5.90
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'ALM-001',
    'Archivador de palanca',
    'Archivador tamaño A4',
    'UNIDAD',
    7.50,
    12.90
  ),
  (
    '50000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000004',
    'ALM-002',
    'Caja organizadora',
    'Caja plástica mediana',
    'UNIDAD',
    18.00,
    29.90
  )
on conflict (id) do nothing;

-- Existencias iniciales en cero.
-- El stock real se registrará posteriormente mediante movimientos controlados.
insert into public.existencias_producto (
  id,
  almacen_id,
  producto_id,
  stock_actual,
  stock_minimo
)
values
  (
    '60000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    0,
    20
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    0,
    50
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000003',
    0,
    10
  ),
  (
    '60000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000004',
    0,
    10
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000005',
    0,
    15
  ),
  (
    '60000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000006',
    0,
    30
  ),
  (
    '60000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000007',
    0,
    15
  ),
  (
    '60000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000008',
    0,
    8
  )
on conflict (id) do nothing;

commit;
