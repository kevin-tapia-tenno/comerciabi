-- ComercioBI
-- Migración 005: habilitar Row Level Security (RLS)
-- En esta fase solo se activa RLS. Las políticas se crearán en la fase de autenticación.

begin;

alter table public.empresas enable row level security;
alter table public.perfiles enable row level security;
alter table public.usuarios_empresa enable row level security;
alter table public.clientes enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.almacenes enable row level security;
alter table public.existencias_producto enable row level security;
alter table public.canales_venta enable row level security;
alter table public.ventas enable row level security;
alter table public.detalle_venta enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.cargas_archivo enable row level security;
alter table public.errores_carga enable row level security;

commit;
