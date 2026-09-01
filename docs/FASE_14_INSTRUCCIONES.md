# Fase 14 - IA y Pronósticos

## Objetivo

Incorporar capacidades analíticas predictivas a ComercioBI utilizando
los datos comerciales e inventario almacenados en PostgreSQL/Supabase.

## Arquitectura

PostgreSQL/Supabase
-> esquema analytics
-> Python
-> modelos predictivos
-> resultados analíticos
-> aplicación React

## Componentes

1. Pronóstico de ventas.
2. Recomendaciones de inventario.
3. Resumen comercial automático.
4. Visualización de resultados en ComercioBI.

## Fuente de datos

Las predicciones utilizarán principalmente:

- analytics.fact_ventas
- analytics.fact_inventario_snapshot
- analytics.dim_fecha
- analytics.dim_producto
- analytics.dim_empresa
- analytics.dim_almacen

## Principios

- No modificar los cálculos históricos ya validados.
- No utilizar datos futuros para entrenar modelos.
- Mantener aislamiento multiempresa.
- Mantener trazabilidad de las predicciones.
- Separar datos transaccionales de resultados predictivos.
- Los modelos apoyan decisiones y no modifican automáticamente ventas o inventario.

## Entregables previstos

- Dataset histórico de entrenamiento.
- Modelo de pronóstico de ventas.
- Tabla de predicciones.
- Motor de recomendaciones de inventario.
- Resumen comercial automático.
- Página web IA y Pronósticos.
- Pruebas de validación.git status