# Power Query de ComercioBI

Estos scripts permiten reconstruir las consultas del PBIX de forma reproducible.

## Parámetros requeridos

Crea dos parámetros en Power Query:

- `pServidorPostgreSQL`: el host del Session pooler con puerto, por ejemplo `aws-0-REGION.pooler.supabase.com:5432`.
- `pBaseDatos`: `postgres`.

Las credenciales NO se escriben en los archivos `.m`. Power BI las almacena mediante la configuración de origen de datos.

## Nombres finales de consultas

- Fecha
- Empresa
- Cliente
- Producto
- Vendedor
- Canal
- Almacen
- Ventas
- Inventario

El proyecto usa modo **Import**.
