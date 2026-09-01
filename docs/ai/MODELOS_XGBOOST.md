# Fase 14 — Modelos XGBoost

## Estrategia

Se usa pronóstico directo multi-horizonte para evitar utilizar valores reales del holdout como entrada.

- Ventas: 3 modelos, h1-h3.
- Demanda: 30 modelos, h1-h30.

## Preprocesamiento

- categóricas: imputación + OneHotEncoder;
- numéricas: imputación por mediana;
- estimador: XGBRegressor;
- `tree_method="hist"`.

## Evaluación

El holdout no se usa para ajustar hiperparámetros. Se compara XGBoost con el baseline usando WAPE como métrica primaria y MAE como respaldo.

Si XGBoost no supera al baseline, el baseline continúa siendo el campeón.

## Artefactos locales

Se generan en `etl/output/ai/`:

- `models/sales_xgboost_direct.joblib`;
- `models/demand_xgboost_direct.joblib`;
- `xgboost_sales_predictions.csv`;
- `xgboost_demand_predictions.csv`;
- `xgboost_sales_metrics_by_product.csv`;
- `xgboost_demand_metrics_by_product.csv`;
- `xgboost_sales_feature_importance.csv`;
- `xgboost_demand_feature_importance.csv`;
- `model_comparison.json`.

Todavía no se persisten predicciones en PostgreSQL. Eso se hará después de seleccionar el campeón.
