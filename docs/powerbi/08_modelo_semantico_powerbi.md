# 08. Modelo semántico Power BI

## Objetivo

La Fase 13 consume el modelo estrella construido por el ETL de la Fase 12.

### Dimensiones

- Fecha
- Empresa
- Cliente
- Producto
- Vendedor
- Canal
- Almacen

### Hechos

- Ventas
- Inventario

## Principio de modelado

Las dimensiones filtran a los hechos mediante relaciones 1:* de dirección única.

No se relacionan las tablas de hechos entre sí.

## Grano

`Ventas`: una fila por línea de producto de una venta confirmada.

`Inventario`: una fila por fecha de snapshot + empresa + producto + almacén.

## Inventario

Las medidas de inventario deben utilizar el último snapshot disponible para no sumar múltiples fotografías históricas.

## Resultado

El PBIX debe contener seis páginas:

1. Resumen ejecutivo.
2. Análisis comercial.
3. Clientes.
4. Productos.
5. Inventario.
6. Detalle de venta (drill-through).
