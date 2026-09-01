from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor

from .config import AI_OUTPUT_DIR, AISettings, ensure_ai_directories
from .metrics import regression_metrics, metrics_by_product


SALES_CATEGORICAL = ["empresa", "sku", "producto", "categoria"]
SALES_NUMERIC = [
    "unidades", "venta_neta", "utilidad_bruta", "margen_bruto_pct",
    "mes", "trimestre", "anio", "mes_sin", "mes_cos", "tendencia_mes",
    "venta_neta_lag_1", "venta_neta_lag_2", "venta_neta_lag_3",
    "venta_neta_lag_6", "venta_neta_lag_12",
    "unidades_lag_1", "unidades_lag_3", "unidades_lag_6", "unidades_lag_12",
    "venta_neta_media_3", "venta_neta_media_6", "venta_neta_media_12",
    "venta_neta_std_3", "venta_neta_std_6",
    "unidades_media_3", "unidades_media_6", "unidades_media_12",
]

DEMAND_CATEGORICAL = ["empresa", "sku", "producto", "categoria"]
DEMAND_NUMERIC = [
    "unidades", "venta_neta", "utilidad_bruta",
    "dia_semana", "dia_mes", "mes", "trimestre",
    "dia_semana_sin", "dia_semana_cos", "mes_sin", "mes_cos", "tendencia_dia",
    "unidades_lag_1", "unidades_lag_2", "unidades_lag_3",
    "unidades_lag_7", "unidades_lag_14", "unidades_lag_28",
    "unidades_media_7", "unidades_media_14", "unidades_media_28",
    "unidades_std_7", "unidades_std_28",
]


def load_csv(name: str) -> pd.DataFrame:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return pd.read_csv(path)


def load_json(name: str) -> dict:
    path = AI_OUTPUT_DIR / name
    if not path.exists():
        raise RuntimeError(f"No existe el archivo requerido: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def make_preprocessor(categorical: list[str], numeric: list[str]) -> ColumnTransformer:
    categorical_pipe = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=True)),
        ]
    )
    numeric_pipe = Pipeline(
        steps=[("imputer", SimpleImputer(strategy="median"))]
    )
    return ColumnTransformer(
        transformers=[
            ("categorical", categorical_pipe, categorical),
            ("numeric", numeric_pipe, numeric),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )


def make_model(seed: int) -> XGBRegressor:
    cpus = os.cpu_count() or 2
    return XGBRegressor(
        objective="reg:squarederror",
        n_estimators=450,
        learning_rate=0.035,
        max_depth=4,
        min_child_weight=2.0,
        subsample=0.90,
        colsample_bytree=0.90,
        reg_alpha=0.05,
        reg_lambda=1.0,
        random_state=seed,
        n_jobs=max(1, cpus // 2),
        tree_method="hist",
        verbosity=0,
    )


def build_direct_dataset(
    df: pd.DataFrame,
    *,
    date_col: str,
    target_col: str,
    horizon: int,
    categorical: list[str],
    numeric: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    data = df.copy()
    data[date_col] = pd.to_datetime(data[date_col])
    data = data.sort_values(["empresa_key", "producto_key", date_col]).reset_index(drop=True)

    missing = [c for c in categorical + numeric if c not in data.columns]
    if missing:
        raise ValueError("Faltan features: " + ", ".join(missing))

    group = data.groupby(["empresa_key", "producto_key"], group_keys=False)
    targets = []
    for h in range(1, horizon + 1):
        col = f"target_h{h}"
        data[col] = group[target_col].shift(-h)
        targets.append(col)

    supervised = data.dropna(subset=targets).copy()
    if supervised.empty:
        raise RuntimeError("No hay filas suficientes para construir el dataset directo.")

    X = supervised[categorical + numeric].copy()
    y = supervised[targets].astype(float).copy()
    return X, y


def latest_origins(df: pd.DataFrame, date_col: str) -> pd.DataFrame:
    data = df.copy()
    data[date_col] = pd.to_datetime(data[date_col])
    data = data.sort_values(["empresa_key", "producto_key", date_col])
    return (
        data.groupby(["empresa_key", "producto_key"], as_index=False, group_keys=False)
        .tail(1)
        .sort_values(["empresa_key", "producto_key"])
        .reset_index(drop=True)
    )


def train_problem(
    train_df: pd.DataFrame,
    holdout_df: pd.DataFrame,
    *,
    name: str,
    date_col: str,
    target_col: str,
    actual_col: str,
    predicted_col: str,
    horizon: int,
    categorical: list[str],
    numeric: list[str],
    seed: int,
) -> tuple[dict, pd.DataFrame, dict, pd.DataFrame, pd.DataFrame]:
    X_train, y_train = build_direct_dataset(
        train_df,
        date_col=date_col,
        target_col=target_col,
        horizon=horizon,
        categorical=categorical,
        numeric=numeric,
    )

    preprocessor = make_preprocessor(categorical, numeric)
    X_matrix = preprocessor.fit_transform(X_train)

    models: dict[int, XGBRegressor] = {}
    for h in range(1, horizon + 1):
        model = make_model(seed + h)
        model.fit(X_matrix, y_train[f"target_h{h}"].to_numpy())
        models[h] = model

    origins = latest_origins(train_df, date_col)
    X_origin = origins[categorical + numeric].copy()
    X_origin_matrix = preprocessor.transform(X_origin)

    predictions_by_h = {
        h: np.maximum(models[h].predict(X_origin_matrix).astype(float), 0.0)
        for h in range(1, horizon + 1)
    }

    holdout = holdout_df.copy()
    holdout[date_col] = pd.to_datetime(holdout[date_col])
    holdout = holdout.sort_values(["empresa_key", "producto_key", date_col]).reset_index(drop=True)
    holdout["horizon"] = holdout.groupby(["empresa_key", "producto_key"]).cumcount() + 1
    holdout = holdout[holdout["horizon"] <= horizon].copy()

    origin_index = {
        (row.empresa_key, row.producto_key): idx
        for idx, row in origins[["empresa_key", "producto_key"]].iterrows()
    }

    rows = []
    for row in holdout.itertuples(index=False):
        key = (row.empresa_key, row.producto_key)
        if key not in origin_index:
            raise RuntimeError(f"Producto del holdout sin origen en train: {key}")
        h = int(row.horizon)
        predicted = float(predictions_by_h[h][origin_index[key]])
        rows.append(
            {
                "empresa_key": row.empresa_key,
                "empresa": row.empresa,
                "producto_key": row.producto_key,
                "sku": row.sku,
                "producto": row.producto,
                "categoria": row.categoria,
                date_col: getattr(row, date_col),
                "horizon": h,
                actual_col: float(getattr(row, target_col)),
                predicted_col: predicted,
                "modelo": "xgboost_direct",
                "origen_datos": row.origen_datos,
            }
        )

    predictions = pd.DataFrame(rows)
    metrics = regression_metrics(predictions[actual_col], predictions[predicted_col])
    product_metrics = metrics_by_product(
        predictions,
        actual_column=actual_col,
        predicted_column=predicted_col,
    )

    feature_names = preprocessor.get_feature_names_out()
    importances = np.vstack([models[h].feature_importances_ for h in range(1, horizon + 1)])
    importance_df = pd.DataFrame(
        {
            "feature": feature_names,
            "importance_mean": importances.mean(axis=0),
        }
    ).sort_values("importance_mean", ascending=False).reset_index(drop=True)

    bundle = {
        "problem": name,
        "strategy": "direct_multi_horizon",
        "horizon": horizon,
        "target": target_col,
        "categorical_features": categorical,
        "numeric_features": numeric,
        "preprocessor": preprocessor,
        "models": models,
        "training_rows_supervised": int(len(X_train)),
    }

    return bundle, predictions, metrics, product_metrics, importance_df


def compare(baseline: dict, model: dict) -> dict:
    baseline_wape = baseline.get("wape_pct")
    model_wape = model.get("wape_pct")

    if baseline_wape is not None and model_wape is not None:
        b = float(baseline_wape)
        m = float(model_wape)
        delta = b - m
        relative = (delta / b * 100.0) if b != 0 else None
        champion = "xgboost" if m < b else "baseline"
    else:
        b = float(baseline["mae"])
        m = float(model["mae"])
        delta = None
        relative = ((b - m) / b * 100.0) if b != 0 else None
        champion = "xgboost" if m < b else "baseline"

    return {
        "baseline_metrics": baseline,
        "xgboost_metrics": model,
        "champion": champion,
        "xgboost_accepted": champion == "xgboost",
        "wape_improvement_percentage_points": round(delta, 4) if delta is not None else None,
        "relative_improvement_pct": round(relative, 4) if relative is not None else None,
    }


def run() -> int:
    settings = AISettings()
    ensure_ai_directories()
    models_dir = AI_OUTPUT_DIR / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    try:
        baseline_metadata = load_json("feature_baseline_metadata.json")
        sales_train = load_csv("training_sales_features.csv")
        demand_train = load_csv("training_demand_features.csv")
        sales_holdout = load_csv("holdout_sales_actual.csv")
        demand_holdout = load_csv("holdout_demand_actual.csv")

        sales_bundle, sales_pred, sales_metrics, sales_prod_metrics, sales_importance = train_problem(
            sales_train,
            sales_holdout,
            name="sales",
            date_col="periodo",
            target_col="venta_neta",
            actual_col="venta_neta_real",
            predicted_col="venta_neta_predicha",
            horizon=3,
            categorical=SALES_CATEGORICAL,
            numeric=SALES_NUMERIC,
            seed=42,
        )

        demand_bundle, demand_pred, demand_metrics, demand_prod_metrics, demand_importance = train_problem(
            demand_train,
            demand_holdout,
            name="demand",
            date_col="fecha",
            target_col="unidades",
            actual_col="unidades_reales",
            predicted_col="unidades_predichas",
            horizon=30,
            categorical=DEMAND_CATEGORICAL,
            numeric=DEMAND_NUMERIC,
            seed=420,
        )

        joblib.dump(sales_bundle, models_dir / "sales_xgboost_direct.joblib", compress=3)
        joblib.dump(demand_bundle, models_dir / "demand_xgboost_direct.joblib", compress=3)

        sales_pred.to_csv(AI_OUTPUT_DIR / "xgboost_sales_predictions.csv", index=False, encoding="utf-8-sig")
        demand_pred.to_csv(AI_OUTPUT_DIR / "xgboost_demand_predictions.csv", index=False, encoding="utf-8-sig")
        sales_prod_metrics.to_csv(AI_OUTPUT_DIR / "xgboost_sales_metrics_by_product.csv", index=False, encoding="utf-8-sig")
        demand_prod_metrics.to_csv(AI_OUTPUT_DIR / "xgboost_demand_metrics_by_product.csv", index=False, encoding="utf-8-sig")
        sales_importance.to_csv(AI_OUTPUT_DIR / "xgboost_sales_feature_importance.csv", index=False, encoding="utf-8-sig")
        demand_importance.to_csv(AI_OUTPUT_DIR / "xgboost_demand_feature_importance.csv", index=False, encoding="utf-8-sig")

        sales_comparison = compare(baseline_metadata["sales"]["metrics"], sales_metrics)
        demand_comparison = compare(baseline_metadata["demand"]["metrics"], demand_metrics)

        comparison = {
            "origin": baseline_metadata["origin"],
            "model_version": settings.model_version,
            "evaluation_policy": {
                "forecast_strategy": "direct_multi_horizon",
                "holdout_reused_for_hyperparameter_tuning": False,
                "sales_horizon_months": 3,
                "demand_horizon_days": 30,
                "selection_metric": "wape_pct; mae como respaldo",
            },
            "sales": sales_comparison,
            "demand": demand_comparison,
        }
        (AI_OUTPUT_DIR / "model_comparison.json").write_text(
            json.dumps(comparison, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        print()
        print("=== ComercioBI - Fase 14 / Entrenamiento XGBoost ===")
        print(f"Origen evaluado: {baseline_metadata['origin']}")
        print()
        print("--- Ventas / horizonte 3 meses ---")
        print(
            f"Baseline | MAE={baseline_metadata['sales']['metrics']['mae']} | "
            f"RMSE={baseline_metadata['sales']['metrics']['rmse']} | "
            f"WAPE={baseline_metadata['sales']['metrics']['wape_pct']}%"
        )
        print(
            f"XGBoost  | MAE={sales_metrics['mae']} | RMSE={sales_metrics['rmse']} | "
            f"WAPE={sales_metrics['wape_pct']}%"
        )
        print(f"Campeón ventas: {sales_comparison['champion'].upper()}")
        print(f"Mejora relativa: {sales_comparison['relative_improvement_pct']}%")
        print()
        print("--- Demanda / horizonte 30 días ---")
        print(
            f"Baseline | MAE={baseline_metadata['demand']['metrics']['mae']} | "
            f"RMSE={baseline_metadata['demand']['metrics']['rmse']} | "
            f"WAPE={baseline_metadata['demand']['metrics']['wape_pct']}%"
        )
        print(
            f"XGBoost  | MAE={demand_metrics['mae']} | RMSE={demand_metrics['rmse']} | "
            f"WAPE={demand_metrics['wape_pct']}%"
        )
        print(f"Campeón demanda: {demand_comparison['champion'].upper()}")
        print(f"Mejora relativa: {demand_comparison['relative_improvement_pct']}%")
        print()
        print("Política de evaluación:")
        print("- Estrategia: direct_multi_horizon")
        print("- Holdout usado para tuning: False")
        print("- Persistencia PostgreSQL realizada: False")
        print()
        print("Entrenamiento y evaluación XGBoost completados.")
        return 0

    except (RuntimeError, ValueError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"ERROR inesperado durante entrenamiento: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
