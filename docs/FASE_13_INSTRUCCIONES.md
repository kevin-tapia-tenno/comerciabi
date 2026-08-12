# Fase 13 - Power BI

Esta fase construye el informe ejecutivo de ComercioBI sobre el esquema `analytics` de PostgreSQL/Supabase.

## Entregable principal

`powerbi/comerciabi.pbix`

## Páginas obligatorias

1. Resumen ejecutivo
2. Análisis comercial
3. Clientes
4. Productos
5. Inventario
6. Detalle de venta (drill-through)

## Modelo

Usar las nueve tablas:

- analytics.dim_fecha
- analytics.dim_empresa
- analytics.dim_cliente
- analytics.dim_producto
- analytics.dim_vendedor
- analytics.dim_canal
- analytics.dim_almacen
- analytics.fact_ventas
- analytics.fact_inventario_snapshot

Modo de conexión: Import.

Las relaciones están documentadas en `powerbi/documentation/modelo_relaciones.txt`.

## Medidas

Copiar las medidas desde:

- `powerbi/dax/01_medidas_ventas.dax`
- `powerbi/dax/02_medidas_inventario.dax`
- `powerbi/dax/03_medidas_tiempo.dax`

## Validación

Ejecutar:

`database/tests/012_verificaciones_powerbi.sql`

y contrastar los resultados con las tarjetas del PBIX.

Luego ejecutar:

`.\scriptserificar_fase13.ps1`

## Commit sugerido

`git commit -m "feat: implementar dashboard ejecutivo Power BI"`
