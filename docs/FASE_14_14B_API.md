# Fase 14.14B — API FastAPI multiempresa

## Objetivo

Convertir la serving layer de Fase 14 en una API profesional consumible por
React, Power BI y futuras integraciones.

La API **no entrena modelos**. El pipeline ETL/IA sigue siendo responsable de:
preparación, entrenamiento, champion selection, intervalos, forecast,
persistencia, recomendaciones e insights.

## Flujo

```text
Supabase Auth
    │ access_token
    ▼
FastAPI
    ├─ valida JWT
    ├─ obtiene sub = public.perfiles.id
    ├─ valida public.usuarios_empresa
    ├─ resuelve empresas.id
    │        ↓
    │ analytics.dim_empresa.source_empresa_id
    │        ↓
    │ empresa_key
    ▼
analytics.vw_ai_*
```

## Aislamiento multiempresa

Nunca se confía en un `empresa_key` enviado por el navegador.

Si un usuario tiene varias empresas, el cliente envía:

```http
X-Empresa-Id: <public.empresas.id>
```

La API verifica la membresía antes de resolver `empresa_key`.

## Endpoints

```text
GET /api/v1/health
GET /api/v1/health/db
GET /api/v1/auth/me

GET /api/v1/ai/summary
GET /api/v1/ai/insights
GET /api/v1/ai/forecasts/sales
GET /api/v1/ai/forecasts/demand
GET /api/v1/ai/inventory/recommendations
GET /api/v1/ai/dashboard

GET /api/docs
GET /api/redoc
GET /api/openapi.json
```

## Paso 1 — extraer parche

Extrae el ZIP directamente sobre:

```text
C:\Users\HP\Desktop\Proyectos\comerciabi
```

No dejes una carpeta intermedia.

## Paso 2 — migración 022

En Supabase SQL Editor ejecuta:

```text
database/migrations/022_api_readonly_role.sql
```

Luego genera una contraseña fuerte y ejecuta una sola vez:

```sql
create role comerciabi_api
with login password '<PASSWORD_FUERTE>';

grant comerciabi_api_reader to comerciabi_api;
```

No guardes la contraseña en Git.

La migración también crea `analytics.api_usuario_contexto(uuid)`, una función
`SECURITY DEFINER` de solo lectura. Así el rol de la API no necesita permisos
directos sobre `public.perfiles`, `public.usuarios_empresa` ni
`analytics.dim_empresa`; conserva el aislamiento del modelo existente y evita
pelear con las políticas RLS desde una conexión PostgreSQL externa.

## Paso 3 — api/.env

```powershell
Copy-Item .\api\.env.example .\api\.env
notepad .\api\.env
```

Completa:

```text
SUPABASE_PUBLISHABLE_KEY=
API_DB_USER=
API_DB_PASSWORD=
```

La conexión para la API serverless queda en:

```text
API_DB_HOST=aws-0-sa-east-1.pooler.supabase.com
API_DB_PORT=6543
API_DB_SSLMODE=require
```

## Paso 4 — crear entorno Python independiente para la API

No mezcles las dependencias del ETL/ML (pandas, XGBoost, etc.) con el
runtime web. La API tiene su propio entorno:

```powershell
py -3.14 -m venv .\api\.venv
.\api\.venv\Scripts\python.exe -m pip install --upgrade pip
.\api\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

## Paso 5 — verificar estructura

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Unblock-File .\scripts\verificar_fase14_api.ps1
.\scripts\verificar_fase14_api.ps1
```

## Paso 6 — levantar API

```powershell
.\api\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000
```

Abre:

```text
http://127.0.0.1:8000/api/docs
```

Prueba:

```text
GET /api/v1/health
GET /api/v1/health/db
```

## Paso 7 — sesión real

Usa el `access_token` de una sesión real de Supabase Auth.

Después prueba:

```text
GET /api/v1/auth/me
GET /api/v1/ai/summary
GET /api/v1/ai/dashboard
```

Si el usuario tiene más de una empresa, agrega `X-Empresa-Id`.

## Paso 8 — tests

```powershell
.\api\.venv\Scripts\python.exe -m pytest .\tests\api -q
```

## Definition of Done

- Health API = 200.
- Health DB = 200.
- `/auth/me` sin token = 401.
- `/auth/me` con token devuelve perfil y membresía.
- `/ai/summary` solo devuelve empresa autorizada.
- `X-Empresa-Id` ajeno = 403.
- `/ai/dashboard` devuelve summary, insights, forecasts e inventario.
- Swagger funciona.
- pytest pasa.
- `api/.env` no está versionado.
- No se ha desplegado a producción hasta completar estas pruebas.

## Siguiente bloque

**Fase 14.14C — integración React → FastAPI.**
