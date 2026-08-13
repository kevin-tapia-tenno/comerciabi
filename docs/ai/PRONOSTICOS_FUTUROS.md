# ComercioBI - Fase 14.11 - Pronósticos futuros

## Objetivo

Convertir la evaluación de modelos de la Fase 14 en pronósticos realmente futuros,
sin mezclar el holdout de evaluación con el horizonte que posteriormente consumirá
la aplicación.

## Principio de diseño

1. `model_comparison.json` decide el campeón de cada problema.
2. La selección del campeón no se vuelve a calcular en este bloque.
3. Si el campeón es XGBoost, se reentrena con toda la historia observable antes de
   producir el forecast futuro.
4. Si el campeón es baseline, se reutiliza la misma lógica baseline ganadora.
5. Ningún forecast futuro utiliza observaciones posteriores a la fecha de referencia.
6. Este checkpoint todavía no escribe en PostgreSQL.
7. La persistencia se realiza únicamente después de validar los artefactos futuros.

## Horizontes

- Ventas: 3 meses.
- Demanda: 30 días.

Los valores se toman de `AISettings`, por lo que existe una única fuente de verdad
para la configuración de la Fase 14.

## Artefactos de entrada

- `dataset_ventas_ai.csv`
- `dataset_inventario_ai.csv`
- `dataset_metadata.json`
- `feature_baseline_metadata.json`
- `model_comparison.json`

## Artefactos de salida

- `future_sales_forecast.csv`
- `future_demand_forecast.csv`
- `future_forecast_metadata.json`

Cuando XGBoost es campeón también se genera el modelo reentrenado de producción:

- `models/sales_xgboost_production.joblib`
- `models/demand_xgboost_production.joblib`

Solo se genera el archivo correspondiente al problema cuyo campeón sea XGBoost.

## Estado esperado del proyecto actual

Con la evaluación realizada en el checkpoint anterior:

- Ventas: baseline campeón.
- Demanda: XGBoost campeón.

Por tanto, el comportamiento esperado es:

- Ventas futuras mediante baseline estacional.
- Demanda futura mediante XGBoost reentrenado con toda la historia disponible.

## Separación evaluación / producción

El modelo usado para comparar baseline vs XGBoost fue entrenado exclusivamente con
el tramo de entrenamiento y evaluado contra holdout.

Después de seleccionar el campeón, el forecast de producción se genera de forma
distinta:

- el holdout deja de ser un conjunto de evaluación;
- pasa a formar parte de la historia observable;
- el modelo campeón se reentrena utilizando toda la historia disponible;
- las predicciones empiezan estrictamente después de la fecha de referencia.

Esto evita desperdiciar información válida en el modelo final sin contaminar la
evaluación que decidió el campeón.

## Persistencia

En este checkpoint:

`postgresql_written = false`

La razón es deliberada. Primero se generan y validan los pronósticos como artefactos
locales reproducibles. Solo después se crearán:

- una ejecución en `analytics.ai_ejecuciones`;
- pronósticos de ventas;
- pronósticos de demanda;
- recomendaciones de inventario.

Esta separación permite evitar insertar resultados defectuosos en la base de datos.
