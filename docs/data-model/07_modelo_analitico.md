# 07. Modelo analítico de ComercioBI

## Objetivo

Separar el modelo transaccional usado por la aplicación del modelo orientado a análisis que utilizará Power BI.

El esquema analítico se crea bajo `analytics`, mientras que las operaciones del sistema continúan en `public`.

## Hecho de ventas

**Tabla:** `analytics.fact_ventas`

**Grano:** una fila por línea de detalle de una venta con estado `CONFIRMADA`.

Medidas principales:

- cantidad;
- precio unitario;
- costo unitario histórico;
- descuento de línea;
- descuento de cabecera asignado;
- venta neta;
- impuesto asignado;
- facturación;
- costo total;
- utilidad bruta.

La utilidad utiliza el costo histórico almacenado en `detalle_venta.costo_unitario`, manteniendo la misma regla utilizada por el dashboard web de la Fase 11.

## Hecho de inventario

**Tabla:** `analytics.fact_inventario_snapshot`

**Grano:** una fila por fecha + empresa + producto + almacén.

El ETL conserva un snapshot por día. Reejecutarlo el mismo día actualiza ese snapshot y no crea duplicados.

Medidas/atributos:

- stock actual;
- stock mínimo;
- costo unitario vigente;
- valor de stock;
- indicador de stock crítico;
- indicador de agotado.

## Dimensiones

- `dim_fecha`
- `dim_empresa`
- `dim_cliente`
- `dim_producto`
- `dim_vendedor`
- `dim_canal`
- `dim_almacen`

Las dimensiones utilizan claves sustitutas numéricas (`*_key`) y conservan el UUID original en columnas `source_*_id` para trazabilidad.

## Estrategia de carga

### Ventas

Se realiza una recarga completa de `fact_ventas` en cada ETL. Para el tamaño del MVP esta estrategia es simple, reproducible e idempotente. La fuente de verdad continúa siendo el modelo transaccional.

### Inventario

Se utiliza `upsert` por fecha + empresa + producto + almacén para conservar snapshots históricos sin duplicar el día actual.

### Dimensiones

Se actualizan mediante `upsert` usando los UUID del sistema transaccional como claves naturales de integración.
