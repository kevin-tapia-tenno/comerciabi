# Fase 12 - ETL Python y modelo analítico

Esta fase recupera el componente Python/ETL previsto desde la arquitectura inicial y construye el modelo de hechos y dimensiones que utilizará Power BI en la Fase 13.

## 1. Precondición

La Fase 11 debe estar comprometida en Git y `git status` debe mostrar:

```text
nothing to commit, working tree clean
```

## 2. Aplicar el parche

Copia el contenido del parche dentro de la raíz de `comerciabi` y permite combinar las carpetas.

Esta fase agrega archivos; no reemplaza el dashboard React de la Fase 11.

## 3. Crear el esquema analytics

En Supabase > SQL Editor crea una consulta nueva y ejecuta completo:

```text
database/migrations/017_modelo_analitico.sql
```

Debe finalizar sin error.

## 4. Preparar Python

Desde la raíz del proyecto:

```powershell
.\scripts\preparar_fase12.ps1
```

El script crea `etl/.venv` e instala Pandas, SQLAlchemy, psycopg y python-dotenv.

## 5. Configurar la conexión PostgreSQL

En Supabase presiona **Connect** y selecciona los parámetros de **Session pooler**.

Copia:

- Host
- Port
- Database name
- User

La contraseña es la contraseña de base de datos de tu proyecto Supabase.

En VS Code:

1. entra a `etl`;
2. duplica `.env.example`;
3. renombra la copia como `.env`;
4. completa los valores reales.

Ejemplo de estructura:

```env
DB_HOST=aws-0-REGION.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.REFERENCIA_PROYECTO
DB_PASSWORD=TU_PASSWORD_REAL
DB_SSLMODE=require
```

`etl/.env` está ignorado por Git. No publiques ni compartas ese archivo.

## 6. Prueba sin carga

Ejecuta:

```powershell
.\scripts\ejecutar_fase12.ps1 -DryRun
```

Debe:

- conectar a PostgreSQL;
- extraer tablas operacionales;
- transformar datos;
- validar calidad;
- generar CSV en `etl/output`;
- NO modificar tablas de hechos/dimensiones.

## 7. Ejecutar ETL completo

```powershell
.\scripts\ejecutar_fase12.ps1
```

Al final debe aparecer `ETL COMPLETADO CORRECTAMENTE`.

## 8. Verificar SQL

En Supabase SQL Editor ejecuta completo:

```text
database/tests/011_verificaciones_modelo_analitico.sql
```

Criterios principales:

- la última ejecución de `analytics.etl_ejecuciones` está `COMPLETADA`;
- las líneas operacionales confirmadas coinciden con `analytics.fact_ventas`;
- la diferencia de venta neta y utilidad es cero o un redondeo mínimo;
- la consulta de diferencias de facturación por venta devuelve 0 filas;
- la consulta de duplicados de inventario devuelve 0 filas;
- las vistas analíticas devuelven datos cuando existe información operacional.

## 9. Verificación local

```powershell
.\scripts\verificar_fase12.ps1
```

## 10. Commit

Solo cuando todo funcione:

```powershell
git add .
git status
git commit -m "feat: implementar ETL y modelo analitico"
git status
git log --oneline -3
```

Al terminar, `git status` debe mostrar el árbol limpio.
