from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine, text


AI_DIR = Path(__file__).resolve().parent
SRC_DIR = AI_DIR.parent
ETL_DIR = SRC_DIR.parent

OUTPUT_PATH = (
    ETL_DIR
    / "output"
    / "ai"
    / "inventory_recommendations.csv"
)

if str(ETL_DIR) not in sys.path:
    sys.path.insert(0, str(ETL_DIR))

from src.config import load_database_config  # noqa: E402


class ValidationError(RuntimeError):
    pass


def main() -> None:
    print(
        "=== ComercioBI - Verificación Fase 14 / "
        "Recomendaciones inventario ==="
    )
    print()

    if not OUTPUT_PATH.exists():
        raise ValidationError(
            "No existe inventory_recommendations.csv."
        )

    df = pd.read_csv(OUTPUT_PATH)

    if df.empty:
        raise ValidationError(
            "El archivo de recomendaciones está vacío."
        )

    required = {
        "ai_ejecucion_id",
        "empresa_key",
        "producto_key",
        "almacen_key",
        "stock_actual",
        "stock_minimo",
        "demanda_30d",
        "stock_objetivo",
        "cantidad_sugerida",
        "riesgo",
        "motivo",
    }

    missing = required - set(df.columns)

    if missing:
        raise ValidationError(
            "Faltan columnas: "
            + ", ".join(sorted(missing))
        )

    valid_risks = {
        "BAJO",
        "MEDIO",
        "ALTO",
        "CRITICO",
    }

    invalid_risks = (
        set(df["riesgo"].dropna())
        - valid_risks
    )

    if invalid_risks:
        raise ValidationError(
            "Riesgos inválidos: "
            + ", ".join(
                sorted(invalid_risks)
            )
        )

    numeric_columns = [
        "stock_actual",
        "stock_minimo",
        "demanda_30d",
        "stock_objetivo",
        "cantidad_sugerida",
    ]

    for column in numeric_columns:
        values = pd.to_numeric(
            df[column],
            errors="coerce",
        )

        if values.isna().any():
            raise ValidationError(
                f"{column} contiene valores inválidos."
            )

        if (values < 0).any():
            raise ValidationError(
                f"{column} contiene valores negativos."
            )

    duplicates = df.duplicated(
        subset=[
            "ai_ejecucion_id",
            "empresa_key",
            "producto_key",
            "almacen_key",
        ]
    ).sum()

    if duplicates:
        raise ValidationError(
            f"Existen {duplicates} recomendaciones duplicadas."
        )

    expected_quantity = (
        df["stock_objetivo"]
        - df["stock_actual"]
    ).clip(lower=0)

    differences = (
        df["cantidad_sugerida"]
        - expected_quantity
    ).abs()

    if (differences > 1.0).any():
        raise ValidationError(
            "La cantidad sugerida no coincide con "
            "la política de stock objetivo."
        )

    execution_ids = (
        df["ai_ejecucion_id"]
        .astype(int)
        .unique()
        .tolist()
    )

    if len(execution_ids) != 1:
        raise ValidationError(
            "Se esperaba una sola ejecución IA."
        )

    execution_id = execution_ids[0]

    config = load_database_config()

    engine = create_engine(
        config.sqlalchemy_url(),
        pool_pre_ping=True,
    )

    try:
        with engine.connect() as conn:
            db_count = conn.execute(
                text(
                    """
                    select count(*)
                    from analytics.ai_recomendacion_inventario
                    where ai_ejecucion_id = :execution_id
                    """
                ),
                {
                    "execution_id": execution_id
                },
            ).scalar_one()

        if int(db_count) != len(df):
            raise ValidationError(
                "La cantidad de recomendaciones en "
                "PostgreSQL no coincide con el artefacto."
            )

    finally:
        engine.dispose()

    print(
        f"Ejecución IA: {execution_id}"
    )
    print(
        f"Recomendaciones: {len(df)}"
    )
    print(
        "Productos: "
        f"{df['producto_key'].nunique()}"
    )
    print(
        "Almacenes: "
        f"{df['almacen_key'].nunique()}"
    )
    print(
        f"Duplicados: {duplicates}"
    )
    print(
        "Unidades sugeridas: "
        f"{df['cantidad_sugerida'].sum():.0f}"
    )

    print()

    counts = (
        df["riesgo"]
        .value_counts()
        .to_dict()
    )

    for risk in [
        "CRITICO",
        "ALTO",
        "MEDIO",
        "BAJO",
    ]:
        print(
            f"{risk}: "
            f"{counts.get(risk, 0)}"
        )

    print()
    print(
        "Validación de recomendaciones "
        "completada correctamente."
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print()
        print("ERROR:")
        print(str(exc))
        raise SystemExit(1) from exc