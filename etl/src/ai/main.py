from __future__ import annotations

import json
import sys
from pathlib import Path

from ..config import ConfigError, load_database_config
from ..db import (
    check_analytics_schema,
    check_database_connection,
    create_database_engine,
)
from .config import AI_OUTPUT_DIR, AISettings, ensure_ai_directories
from .data import load_ai_data


def _write_metadata(
    path: Path,
    *,
    origin: str,
    reason: str,
    reference_date: str,
    sales_rows: int,
    inventory_rows: int,
    real_sales_rows: int,
    real_sales_months: int,
    settings: AISettings,
) -> None:
    metadata = {
        "origin": origin,
        "reason": reason,
        "reference_date": reference_date,
        "sales_rows_selected": sales_rows,
        "inventory_rows": inventory_rows,
        "real_sales_rows": real_sales_rows,
        "real_sales_months": real_sales_months,
        "minimum_real_sales_rows": settings.min_real_sales_rows,
        "minimum_real_sales_months": settings.min_real_sales_months,
        "demo_months": settings.demo_months,
        "sales_horizon_months": settings.sales_horizon_months,
        "demand_horizon_days": settings.demand_horizon_days,
        "model_version": settings.model_version,
    }

    path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def run() -> int:
    settings = AISettings()
    ensure_ai_directories()

    try:
        database_config = load_database_config()
        engine = create_database_engine(database_config)

        check_database_connection(engine)
        check_analytics_schema(engine)

        bundle = load_ai_data(engine=engine, settings=settings)

        sales_path = AI_OUTPUT_DIR / "dataset_ventas_ai.csv"
        inventory_path = AI_OUTPUT_DIR / "dataset_inventario_ai.csv"
        metadata_path = AI_OUTPUT_DIR / "dataset_metadata.json"

        bundle.sales_history.to_csv(
            sales_path,
            index=False,
            encoding="utf-8-sig",
        )
        bundle.inventory.to_csv(
            inventory_path,
            index=False,
            encoding="utf-8-sig",
        )

        _write_metadata(
            metadata_path,
            origin=bundle.origin,
            reason=bundle.reason,
            reference_date=bundle.reference_date.date().isoformat(),
            sales_rows=len(bundle.sales_history),
            inventory_rows=len(bundle.inventory),
            real_sales_rows=bundle.real_sales_rows,
            real_sales_months=bundle.real_sales_months,
            settings=settings,
        )

        print()
        print("=== ComercioBI - Fase 14 / Preparación de datos IA ===")
        print(f"Origen seleccionado: {bundle.origin}")
        print(bundle.reason)
        print(
            "Fecha de referencia: "
            f"{bundle.reference_date.date().isoformat()}"
        )
        print(
            "Ventas reales disponibles: "
            f"{bundle.real_sales_rows} observaciones / "
            f"{bundle.real_sales_months} meses"
        )
        print(
            "Filas de entrenamiento seleccionadas: "
            f"{len(bundle.sales_history)}"
        )
        print(
            "Posiciones del último inventario: "
            f"{len(bundle.inventory)}"
        )
        print()
        print("Archivos de inspección generados:")
        print(f"- {sales_path}")
        print(f"- {inventory_path}")
        print(f"- {metadata_path}")
        print()
        print(
            "Preparación de datos completada. "
            "Todavía no se entrenó ningún modelo."
        )
        return 0

    except (ConfigError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(
            "ERROR inesperado durante la preparación de datos de IA: "
            f"{exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
