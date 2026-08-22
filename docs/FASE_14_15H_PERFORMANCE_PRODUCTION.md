# Fase 14.15H — Performance y validación en Production

## Estado

COMPLETADA

La Fase 14.15H tuvo como objetivo optimizar el rendimiento del frontend y del serving layer de Inteligencia IA de ComercioBI, reduciendo carga inicial, round-trips hacia PostgreSQL y latencia percibida por el usuario.

---

## 1. Frontend

### Lazy loading de rutas

Se aplicó carga diferida a las páginas de mayor peso y posteriormente al resto de rutas operativas que no necesitan formar parte del bundle inicial.

Entre las rutas separadas se encuentran:

- Clientes
- Productos
- Ventas
- Inventario
- Proveedores
- Compras
- Cargas de archivos
- Reportes
- Inteligencia IA

El Dashboard principal permanece disponible como ruta base de la aplicación.

### Resultado del build

El bundle inicial dejó de contener directamente módulos pesados como:

- SheetJS / XLSX
- Recharts
- páginas comerciales completas
- página de Inteligencia IA

Estos recursos pasan a cargarse únicamente cuando el usuario navega hacia la funcionalidad correspondiente.

El build de producción continuó completándose correctamente con Vite 8.

---

## 2. Serving layer de Inteligencia IA

Anteriormente el endpoint:

GET /api/v1/ai/dashboard

realizaba varias consultas PostgreSQL secuenciales para obtener:

- resumen IA
- insights
- pronóstico de ventas
- pronóstico de demanda
- recomendaciones de inventario

Se reemplazó ese flujo por una sola operación PostgreSQL mediante:

get_ai_dashboard_bundle()

La consulta construye el contrato completo del dashboard utilizando JSONB en PostgreSQL.

### Contrato validado

La respuesta mantiene:

- summary: 1
- insights: 13
- sales_forecast: 27
- demand_forecast: 270
- inventory_recommendations: 9

No se modificó el contrato consumido por el frontend.

---

## 3. Pool de conexiones

Se reemplazó NullPool por un QueuePool pequeño para permitir reutilización de la conexión cliente hacia Supavisor entre requests calientes.

Configuración aplicada:

- pool_size = 1
- max_overflow = 0
- pool_timeout = 10
- pool_recycle = 300
- pool_pre_ping = False
- pool_use_lifo = True

Se mantiene:

prepare_threshold = None

por compatibilidad con Supavisor en transaction mode.

---

## 4. AUTOCOMMIT para serving read-only

El serving layer de IA utiliza un rol PostgreSQL de solo lectura.

Para evitar transacciones innecesarias alrededor de consultas SELECT se configuró:

isolation_level = AUTOCOMMIT

y, usando SQLAlchemy compatible:

skip_autocommit_rollback = True

Esto elimina el ROLLBACK DBAPI innecesario al devolver conexiones autocommit al pool.

---

## 5. Benchmarks

### PostgreSQL — single round-trip

Después de consolidar el dashboard en una sola consulta, las pruebas locales calientes mostraron aproximadamente:

- query mediana: 217 ms
- conexión reutilizada: ~0.1 ms
- cierre lógico de conexión con AUTOCOMMIT: prácticamente inmediato

La primera ejecución se considera cold start y no se utiliza para evaluar rendimiento sostenido.

### API local

El benchmark HTTP del endpoint consolidado mostró aproximadamente:

- mediana warm: 499 ms

con contrato completo y autenticación funcional.

### Production

Después del deployment a Vercel se verificó:

- GET /api/v1/health -> HTTP 200
- GET /api/v1/health/db -> HTTP 200
- OpenAPI -> HTTP 200
- autenticación JWT -> correcta
- aislamiento tenant -> correcto
- dashboard IA -> HTTP 200
- contrato completo -> correcto

Benchmark warm de Production observado:

- promedio: ~1.00 s
- mediana: ~1.01 s
- mínimo: ~664 ms
- máximo: ~1.23 s

Adicionalmente, una navegación real desde Chrome DevTools registró aproximadamente:

- /api/v1/ai/dashboard: 729 ms

---

## 6. Validación en navegador

La aplicación fue validada directamente en Production utilizando Chrome DevTools.

### Network

Se confirmó:

- requests de contexto Supabase -> HTTP 200
- request dashboard IA -> HTTP 200
- sin 4xx inesperados
- sin 5xx
- sin errores CORS

### Console

La consola quedó sin errores JavaScript relacionados con la aplicación.

No se observaron:

- excepciones React
- errores de chunks
- errores de autenticación
- errores CORS
- errores de serving IA

---

## 7. Pruebas

La suite de API continúa aprobando:

5 passed

Existe una advertencia deprecada de Starlette TestClient relacionada con httpx, pero no afecta la funcionalidad actual.

También se validaron correctamente:

- TypeScript
- build Vite
- git diff --check
- smoke test Auth/JWT/Tenant
- contrato del dashboard IA

---

## 8. Commits principales de la optimización

Frontend:

ec37e8d perf(frontend): lazy-load application routes

Backend:

ddb1427 perf(api): optimize AI dashboard database round trips

---

## 9. Arquitectura resultante

Flujo del dashboard IA:

Browser
  ->
Vercel Frontend
  ->
FastAPI
  ->
JWT + Tenant validation
  ->
SQLAlchemy QueuePool
  ->
Supavisor Transaction Pooler
  ->
1 round-trip PostgreSQL
  ->
JSONB dashboard
  ->
FastAPI response
  ->
React IntelligencePage

---

## 10. Resultado

La Fase 14.15H se considera COMPLETADA.

Se consiguió:

- reducir el bundle inicial del frontend;
- separar módulos pesados mediante lazy loading;
- reducir múltiples consultas del dashboard a un único round-trip;
- reutilizar conexiones calientes hacia Supavisor;
- evitar transacciones y rollbacks innecesarios para consultas read-only;
- preservar JWT, tenant isolation y contrato API;
- validar el comportamiento en Production;
- alcanzar tiempos de respuesta adecuados para la etapa actual del producto.

No se recomienda continuar con microoptimizaciones de esta capa en esta fase.

El siguiente trabajo debe concentrarse en funcionalidad y producto, utilizando esta arquitectura como baseline de rendimiento.
