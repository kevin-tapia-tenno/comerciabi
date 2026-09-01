# IA y pronósticos de ComercioBI

## Objetivo

Construir una capa de Machine Learning trazable para pronóstico comercial,
pronóstico de demanda y recomendaciones de inventario.

## Datos

La capa de IA no inserta datos sintéticos en las tablas de hechos reales.

Si no existe historia suficiente, se utiliza un dataset DEMO reproducible.
Los artefactos DEMO permanecen en `etl/output/ai/`, carpeta ignorada por Git.

## Horizontes

- Ventas: 3 meses.
- Demanda: 30 días.

## Feature engineering

### Ventas mensuales por producto

- año, mes y trimestre;
- codificación cíclica del mes;
- tendencia temporal;
- lags de venta neta: 1, 2, 3, 6 y 12 meses;
- lags de unidades: 1, 3, 6 y 12 meses;
- medias móviles: 3, 6 y 12 meses;
- desviaciones móviles: 3 y 6 meses.

### Demanda diaria por producto

- día de semana, día del mes, mes y trimestre;
- codificaciones cíclicas;
- tendencia temporal;
- lags de unidades: 1, 2, 3, 7, 14 y 28 días;
- medias móviles: 7, 14 y 28 días;
- desviaciones móviles: 7 y 28 días.

## Separación temporal

No se usa split aleatorio.

- Holdout de ventas: últimos 3 meses.
- Holdout de demanda: últimos 30 días.

El train siempre termina antes del holdout.

## Baselines

### Ventas

`seasonal_naive_12m`

Repite el mismo mes del año anterior. Si no existe, usa el último valor
observado en train.

### Demanda

`weekly_naive_repeat_7d`

Repite durante todo el horizonte el patrón de los últimos 7 días del train.

Ningún baseline usa valores reales del holdout como entrada.

## Métricas

- MAE;
- RMSE;
- WAPE;
- bias porcentual.

## Artefactos

Se generan en `etl/output/ai/`:

- `training_sales_features.csv`;
- `training_demand_features.csv`;
- `holdout_sales_actual.csv`;
- `holdout_demand_actual.csv`;
- `baseline_sales_predictions.csv`;
- `baseline_demand_predictions.csv`;
- `baseline_sales_metrics_by_product.csv`;
- `baseline_demand_metrics_by_product.csv`;
- `feature_baseline_metadata.json`.

## Siguiente paso

Entrenar XGBoost y aceptar el modelo únicamente si aporta valor frente al
baseline temporal.
