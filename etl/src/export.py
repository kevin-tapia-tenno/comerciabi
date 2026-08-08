from __future__ import annotations

from pathlib import Path

import pandas as pd

from .transform import TransformedData


EXPORTS = {
    "dim_fecha.csv": "dim_date",
    "dim_empresa.csv": "dim_company",
    "dim_cliente.csv": "dim_client",
    "dim_producto.csv": "dim_product",
    "dim_vendedor.csv": "dim_seller",
    "dim_canal.csv": "dim_channel",
    "dim_almacen.csv": "dim_warehouse",
    "fact_ventas.csv": "fact_sales",
    "fact_inventario_snapshot.csv": "fact_inventory",
}


def export_csv_files(data: TransformedData, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Generando archivos de salida del ETL...")

    for file_name, attribute_name in EXPORTS.items():
        frame: pd.DataFrame = getattr(data, attribute_name)
        path = output_dir / file_name
        frame.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"  {file_name}: {len(frame):,} filas")
