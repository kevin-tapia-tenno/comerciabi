from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone

from sqlalchemy import Engine, text

from .config import ConfigError, OUTPUT_DIR, load_database_config
from .db import (
    check_analytics_schema,
    check_database_connection,
    create_database_engine,
)
from .export import export_csv_files
from .extract import extract_operational_data
from .load import load_analytics_model
from .transform import transform_operational_data
from .validate import DataValidationError, validate_transformed_data


def _start_etl_log(engine: Engine) -> int:
    with engine.begin() as connection:
        run_id = connection.execute(
            text(
                """
                insert into analytics.etl_ejecuciones (
                  estado,
                  mensaje,
                  creado_por
                ) values (
                  'EJECUTANDO',
                  'Ejecución iniciada desde Python.',
                  'python-etl'
                )
                returning id
                """
            )
        ).scalar_one()

    return int(run_id)


def _complete_etl_log(
    engine: Engine,
    run_id: int,
    sales_rows: int,
    inventory_rows: int,
) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                update analytics.etl_ejecuciones
                set
                  finalizado_en = now(),
                  estado = 'COMPLETADA',
                  filas_ventas = :sales_rows,
                  filas_inventario = :inventory_rows,
                  mensaje = 'ETL completado correctamente.'
                where id = :run_id
                """
            ),
            {
                "run_id": run_id,
                "sales_rows": sales_rows,
                "inventory_rows": inventory_rows,
            },
        )


def _fail_etl_log(engine: Engine, run_id: int, error: Exception) -> None:
    message = str(error)
    if len(message) > 2000:
        message = message[:2000]

    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    update analytics.etl_ejecuciones
                    set
                      finalizado_en = now(),
                      estado = 'FALLIDA',
                      mensaje = :message
                    where id = :run_id
                    """
                ),
                {"run_id": run_id, "message": message},
            )
    except Exception:
        # No ocultamos el error original si además falla la escritura de log.
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="ETL del modelo analítico de ComercioBI."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Extrae, transforma, valida y exporta CSV, pero no carga "
            "las tablas analytics."
        ),
    )
    parser.add_argument(
        "--no-export",
        action="store_true",
        help="No genera los CSV de etl/output.",
    )
    return parser.parse_args()


def run() -> int:
    args = parse_args()
    started_at = datetime.now(timezone.utc)
    engine: Engine | None = None
    run_id: int | None = None

    print("=" * 68)
    print("ComercioBI - Fase 12 - ETL y modelo analítico")
    print("=" * 68)

    try:
        config = load_database_config()
        engine = create_database_engine(config)

        check_database_connection(engine)
        check_analytics_schema(engine)

        datasets = extract_operational_data(engine)

        print("Transformando datos...")
        transformed = transform_operational_data(datasets)

        print("Validando calidad de datos...")
        warnings = validate_transformed_data(transformed)
        for warning in warnings:
            print(f"ADVERTENCIA: {warning}")

        if not args.no_export:
            export_csv_files(transformed, OUTPUT_DIR)

        if args.dry_run:
            print("Dry-run completado: no se modificó el esquema analytics.")
            return 0

        run_id = _start_etl_log(engine)
        sales_rows, inventory_rows = load_analytics_model(
            engine,
            transformed,
            run_id,
        )
        _complete_etl_log(
            engine,
            run_id,
            sales_rows,
            inventory_rows,
        )

        duration = datetime.now(timezone.utc) - started_at
        print("-")
        print("ETL COMPLETADO CORRECTAMENTE")
        print(f"Ejecución: {run_id}")
        print(f"Líneas de venta cargadas: {sales_rows:,}")
        print(f"Snapshots de inventario procesados: {inventory_rows:,}")
        print(f"Duración: {duration.total_seconds():.2f} s")
        return 0

    except (ConfigError, DataValidationError, ValueError, RuntimeError) as error:
        if engine is not None and run_id is not None:
            _fail_etl_log(engine, run_id, error)
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    except Exception as error:
        if engine is not None and run_id is not None:
            _fail_etl_log(engine, run_id, error)
        print(
            "ERROR NO CONTROLADO: "
            f"{type(error).__name__}: {error}",
            file=sys.stderr,
        )
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(run())
