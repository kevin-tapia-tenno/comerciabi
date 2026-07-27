# ComercioBI — Fase 10 final: cargas Excel/CSV

Este parche conserva la arquitectura construida desde las fases 0 a 9 y reemplaza únicamente el módulo de **Cargas de archivos**.

## Qué queda implementado

1. Lectura local de archivos `.xlsx`, `.xls` y `.csv` de hasta 5 MB.
2. Normalización de encabezados y conservación del número real de fila.
3. Validaciones diferentes para Clientes, Productos y Ventas.
4. Vista previa de las primeras 10 filas.
5. Indicadores separados de filas encontradas, válidas, inválidas y errores.
6. Tabla legible de errores y etiquetas para columnas reconocidas.
7. Plantillas descargables para los tres módulos.
8. Ejecución auditada:
   - crea un registro en `cargas_archivo`;
   - sube el archivo al bucket privado `archivos-carga`;
   - registra los errores en `errores_carga`;
   - inserta únicamente filas válidas;
   - finaliza la carga como `COMPLETADA` o `CON_ERRORES`.
9. Historial de las últimas 15 cargas y descarga del archivo original.
10. Respeto de empresa, membresía, RLS y roles existentes.

## Reglas por módulo

### Clientes

Columnas obligatorias:

- `tipo_cliente`
- `nombre_completo`

Columnas opcionales:

- `tipo_documento`
- `numero_documento`
- `email`
- `telefono`
- `segmento`
- `direccion`
- `activo`

Los campos de documento deben completarse juntos. Los duplicados de documento son rechazados por PostgreSQL y se registran como errores de carga.

### Productos

Columnas obligatorias:

- `sku`
- `nombre`
- `categoria`
- `unidad_medida`
- `costo_actual`
- `precio_venta`

La categoría debe existir y estar activa. Por la política del catálogo, la ejecución masiva de Productos se reserva al rol `ADMIN`.

### Ventas

Cada fila representa un detalle. Las filas con el mismo `codigo_externo` forman una venta.

Columnas obligatorias:

- `codigo_externo`
- `almacen`
- `canal`
- `sku`
- `cantidad`

Debe completarse al menos uno:

- `cliente_documento`
- `cliente_nombre`

Las ventas importadas se crean como `BORRADOR`. No descuentan stock hasta ser confirmadas desde el módulo Ventas. La ejecución masiva de Ventas se reserva al rol `ADMIN`.

---

# Instalación exacta

## Paso 1. Haz una copia del proyecto

Cierra `npm run dev` y copia la carpeta:

```text
C:\Proyectos\comerciabi
```

como respaldo.

## Paso 2. Extrae el ZIP

Extrae el contenido del ZIP directamente sobre:

```text
C:\Proyectos\comerciabi
```

Cuando Windows pregunte, selecciona **Reemplazar los archivos del destino**.

Los archivos reemplazados son:

```text
src/App.tsx
src/index.css
src/pages/ImportsPage.tsx
src/types/imports.ts
src/lib/excel-reader.ts
src/lib/import-validator.ts
src/lib/import-service.ts
```

También se agregan:

```text
database/migrations/014_ajustes_finales_cargas.sql
database/tests/008_verificaciones_cargas_final.sql
public/plantillas/plantilla_clientes.xlsx
public/plantillas/plantilla_productos.xlsx
public/plantillas/plantilla_ventas.xlsx
```

## Paso 3. Confirma SheetJS

Ejecuta:

```powershell
npm list xlsx
```

Debe aparecer `xlsx`. Como ya lo instalaste durante esta fase, no vuelvas a modificar `package.json` si el comando lo reconoce.

Solo si aparece vacío o con error:

```powershell
npm install xlsx
```

## Paso 4. Ejecuta la migración final

En Supabase:

1. Abre **SQL Editor**.
2. Crea una consulta nueva.
3. Copia todo el contenido de:

```text
database/migrations/014_ajustes_finales_cargas.sql
```

4. Presiona **Run**.

Esta migración es idempotente: puede ejecutarse una vez aunque ya existan políticas de la migración 013.

## Paso 5. Verifica Supabase

Ejecuta completo:

```text
database/tests/008_verificaciones_cargas_final.sql
```

Resultados mínimos esperados:

- bucket `archivos-carga` privado;
- límite `5242880` bytes;
- `cantidad_mime = 3`;
- RLS activo en `cargas_archivo` y `errores_carga`;
- tres políticas de Storage del parche.

## Paso 6. Verifica React

En VS Code:

```powershell
npm run build
npm run lint
```

El aviso del bundle superior a 500 kB no bloquea la fase. No deben aparecer errores de TypeScript ni ESLint.

Después:

```powershell
npm run dev
```

## Paso 7. Prueba Clientes sin errores

1. Entra con el usuario administrador.
2. Abre **Cargas de archivos**.
3. Selecciona `Clientes`.
4. Descarga la plantilla o usa `correcto.xlsx`.
5. Presiona **Analizar archivo**.
6. Confirma:
   - 3 filas encontradas;
   - 3 válidas;
   - 0 inválidas;
   - 0 errores.
7. Presiona **Ejecutar 3 filas válidas**.
8. Comprueba que aparezca la carga en el historial.
9. Abre **Clientes** y confirma los nuevos registros.

No repitas el mismo archivo sin cambiar documentos, porque la segunda ejecución detectará duplicados correctamente.

## Paso 8. Prueba Clientes con errores

Usa `clientes_con_errores.xlsx`.

Resultado esperado antes de ejecutar:

- 3 filas encontradas;
- 1 válida;
- 2 inválidas;
- 2 errores.

Al ejecutar:

- solo se inserta la fila válida;
- la carga termina `CON_ERRORES`;
- las dos incidencias quedan en `errores_carga`.

## Paso 9. Prueba Productos

Usa la plantilla incluida. Antes de ejecutar, cambia los SKU de ejemplo por valores que no existan y confirma que las categorías escritas existan exactamente en ComercioBI.

## Paso 10. Prueba Ventas

La plantilla utiliza datos demostrativos. Ajusta:

- cliente;
- almacén;
- canal;
- SKU.

La carga crea ventas en estado `BORRADOR`. Revisa y confirma cada venta desde el módulo Ventas para que se aplique el control de stock ya implementado en la Fase 7.

---

# Cierre de la fase

Cuando todas las pruebas sean correctas:

```powershell
git status
git add .
git commit -m "feat: completar cargas Excel CSV con validacion auditoria e importacion"
git status
git log --oneline -10
```

El último `git status` debe mostrar:

```text
nothing to commit, working tree clean
```
