# ComercioBI - Power BI

Este directorio contiene los recursos versionables de la Fase 13.

El archivo binario final debe guardarse como:

`powerbi/comerciabi.pbix`

## Recursos

- `dax/`: columnas calculadas y medidas DAX.
- `power-query/`: consultas M reproducibles para las 9 tablas del modelo.
- `theme/`: tema visual de ComercioBI.
- `documentation/`: relaciones y documentación del modelo.

## Fuente

PostgreSQL de Supabase, esquema `analytics`, construido en la Fase 12.

## Modo

Se utiliza **Import**, no DirectQuery.

## Seguridad

No guardar contraseñas en archivos del repositorio. Las credenciales PostgreSQL se introducen en la configuración de origen de datos de Power BI Desktop.
