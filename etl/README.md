# ETL de ComercioBI

Este directorio contiene el proceso ETL de la Fase 12.

## Flujo

1. Extrae datos del esquema transaccional `public` de Supabase/PostgreSQL.
2. Transforma los datos con Python + Pandas.
3. Valida identificadores, cantidades, stock y relaciones.
4. Exporta archivos CSV locales en `etl/output/`.
5. Carga dimensiones y hechos en el esquema `analytics`.
6. Registra cada ejecución en `analytics.etl_ejecuciones`.

## Granos del modelo

- `analytics.fact_ventas`: una fila por línea de una venta `CONFIRMADA`.
- `analytics.fact_inventario_snapshot`: una fila por día, empresa, producto y almacén.

## Ejecución

Desde la raíz del proyecto:

```powershell
.\scripts\preparar_fase12.ps1
```

Después configura `etl/.env` y ejecuta:

```powershell
.\scripts\ejecutar_fase12.ps1
```

Para probar sin cargar el esquema analytics:

```powershell
.\etl\.venv\Scripts\python.exe -m src.main --dry-run
```

Este último comando debe ejecutarse estando dentro de la carpeta `etl` o usando el script incluido.
