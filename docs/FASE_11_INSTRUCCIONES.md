# ComercioBI — Fase 11: Dashboard web analítico

## Objetivo

Completar el módulo `/reportes` con indicadores y gráficos interactivos sin alterar los flujos ya terminados de clientes, productos, ventas, inventario, compras e importaciones.

La fase implementa:

- Filtro por periodo.
- Facturación del periodo.
- Cantidad de ventas confirmadas.
- Utilidad bruta usando el costo histórico de `detalle_venta.costo_unitario`.
- Margen bruto.
- Ticket promedio.
- Clientes compradores.
- Productos y unidades vendidas.
- Stock crítico y agotados.
- Valor del inventario.
- Facturación mensual.
- Ventas por categoría.
- Facturación por canal.
- Facturación por vendedor.
- Top de productos.
- Stock crítico detallado.
- Últimas ventas confirmadas.

El acceso queda restringido a `ADMIN`, `GERENTE` y `ANALISTA` tanto en React como dentro de la función PostgreSQL.

---

## Archivos de la fase

### Nuevos

- `database/migrations/016_dashboard_web.sql`
- `database/tests/010_verificaciones_dashboard.sql`
- `src/types/dashboard.ts`
- `src/lib/dashboard-service.ts`
- `src/pages/ReportsPage.tsx`
- `scripts/verificar_fase11.ps1`
- `docs/FASE_11_INSTRUCCIONES.md`

### Modificados

- `src/App.tsx`
- `src/index.css`

Además, `npm install recharts` modificará automáticamente:

- `package.json`
- `package-lock.json`

---

## Paso 1. Comprobar Git antes de copiar el parche

Desde la raíz del proyecto:

```powershell
git status
```

Si aparecen solamente cambios de finales de línea por haber trasladado el proyecto a otra laptop, compruébalo con:

```powershell
git diff --ignore-space-at-eol
```

Si ese comando no muestra diferencias reales, restaura únicamente esos archivos antes de continuar. No restaures archivos si contienen trabajo real que quieras conservar.

Después confirma:

```powershell
git status
```

---

## Paso 2. Copiar el parche

Copia el contenido del ZIP sobre la raíz de `comerciabi`, conservando la estructura de carpetas y aceptando reemplazar `src/App.tsx` y `src/index.css`.

No copies la carpeta contenedora del parche dentro del proyecto. Debes terminar viendo directamente carpetas como `src`, `database`, `docs` y `scripts` dentro de `comerciabi`.

---

## Paso 3. Instalar Recharts

En PowerShell, dentro de la raíz del proyecto:

```powershell
npm install recharts
```

Comprueba:

```powershell
npm list recharts --depth=0
```

Debe aparecer una versión instalada y no un error `empty`.

---

## Paso 4. Ejecutar la migración 016 en Supabase

1. Abre tu proyecto de Supabase.
2. Entra a **SQL Editor**.
3. Crea una nueva consulta.
4. Abre localmente `database/migrations/016_dashboard_web.sql`.
5. Copia todo el contenido.
6. Pégalo en SQL Editor.
7. Presiona **Run**.

La migración crea la función:

```text
public.obtener_dashboard_comercial(uuid, date, date)
```

La función es `SECURITY DEFINER`, pero valida internamente que el usuario autenticado pertenezca a la empresa y tenga uno de estos roles:

```text
ADMIN
GERENTE
ANALISTA
```

No confía solamente en la protección de la ruta de React.

---

## Paso 5. Ejecutar las verificaciones SQL

En una nueva consulta de SQL Editor ejecuta completo:

```text
database/tests/010_verificaciones_dashboard.sql
```

Revisa especialmente:

1. `obtener_dashboard_comercial` existe.
2. Su `security_type` es `DEFINER`.
3. `authenticated` tiene `EXECUTE`.
4. La consulta de ventas confirmadas sin detalle devuelve 0 filas.
5. La consulta de costos históricos inválidos devuelve 0 filas.
6. La consulta de existencias negativas devuelve 0 filas.

Las consultas finales son informativas y sirven para contrastar los importes que después aparecerán en la interfaz.

---

## Paso 6. Levantar la aplicación

Ejecuta:

```powershell
npm run dev
```

Abre la URL que muestre Vite, normalmente:

```text
http://localhost:5173/
```

Inicia sesión con una cuenta `ADMIN`, `GERENTE` o `ANALISTA` y abre **Reportes**.

---

## Paso 7. Pruebas funcionales obligatorias

### Prueba 1 — carga inicial

Al entrar a `/reportes` debe aparecer el periodo desde el 1 de enero del año actual hasta hoy.

Deben mostrarse las tarjetas de indicadores y no debe aparecer un error de función inexistente.

### Prueba 2 — periodos rápidos

Prueba los tres botones:

- Este mes.
- Últimos 3 meses.
- Este año.

Los indicadores y gráficos deben actualizarse.

### Prueba 3 — periodo manual

Selecciona una fecha inicial y una fecha final válidas y presiona **Aplicar periodo**.

Después intenta una fecha inicial posterior a la final. La interfaz debe impedir la consulta y mostrar un mensaje en español.

### Prueba 4 — ventas anuladas y borradores

Los KPIs comerciales solo deben considerar `CONFIRMADA`.

Una venta `BORRADOR` o `ANULADA` no debe incrementar facturación, cantidad de ventas, ticket ni utilidad.

### Prueba 5 — utilidad

La utilidad se calcula con el costo histórico guardado en cada línea:

```text
utilidad de línea = total_linea - (cantidad × costo_unitario histórico)
```

No se utiliza `productos.costo_actual` para recalcular ventas antiguas.

### Prueba 6 — gráficos

Comprueba que se rendericen, cuando existan datos:

- Facturación mensual.
- Ventas por categoría.
- Facturación por canal.
- Facturación por vendedor.
- Top de productos.

Si un conjunto no tiene datos, debe aparecer un estado vacío comprensible y no una pantalla rota.

### Prueba 7 — inventario

La tabla de stock crítico debe mostrar posiciones cuyo `stock_actual` sea menor o igual a `stock_minimo`, siempre que el mínimo sea mayor a cero.

El inventario representa el estado actual y no cambia por modificar el periodo de ventas.

### Prueba 8 — últimas ventas

La tabla debe mostrar hasta 10 ventas confirmadas dentro del periodo aplicado, ordenadas desde la más reciente.

### Prueba 9 — roles

Verifica:

- `ADMIN`: puede entrar.
- `GERENTE`: puede entrar.
- `ANALISTA`: puede entrar.
- `VENDEDOR`: no debe disponer de acceso a Reportes.
- `ALMACEN`: no debe disponer de acceso a Reportes.

La seguridad real también está dentro del RPC PostgreSQL.

### Prueba 10 — ausencia de datos

Si eliges un periodo sin ventas, la página no debe fallar. Los KPIs comerciales deben quedar en cero y los componentes sin registros deben mostrar estados vacíos.

---

## Paso 8. Compilación y lint

Detén el servidor si lo deseas con `Ctrl + C` y ejecuta:

```powershell
npm run build
```

Debe terminar sin errores.

Después:

```powershell
npm run lint
```

También debe terminar sin errores.

Como alternativa puedes ejecutar el verificador incluido:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verificar_fase11.ps1
```

---

## Paso 9. Revisar Git

Ejecuta:

```powershell
git status
```

Entre los cambios de esta fase deben aparecer, como mínimo:

```text
database/migrations/016_dashboard_web.sql
database/tests/010_verificaciones_dashboard.sql
docs/FASE_11_INSTRUCCIONES.md
scripts/verificar_fase11.ps1
src/App.tsx
src/index.css
src/lib/dashboard-service.ts
src/pages/ReportsPage.tsx
src/types/dashboard.ts
package.json
package-lock.json
```

Los dos últimos cambian por la instalación de Recharts.

---

## Paso 10. Commit de aprobación

Haz el commit solamente después de que:

- la migración 016 funcione;
- las verificaciones SQL sean correctas;
- `/reportes` funcione;
- los roles sean correctos;
- `npm run build` pase;
- `npm run lint` pase.

Entonces ejecuta:

```powershell
git add .
git commit -m "feat: implementar dashboard web analitico"
git status
```

El resultado final esperado es:

```text
nothing to commit, working tree clean
```

Con eso la **Fase 11 queda aprobada**.
