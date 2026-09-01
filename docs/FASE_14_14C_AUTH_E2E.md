# ComercioBI — Fase 14.14C: validación autenticada end-to-end

Este parche **no cambia la API existente**. Añade un smoke test real para comprobar el flujo:

Supabase Auth -> JWT -> FastAPI -> contexto multiempresa -> serving layer IA.

## Archivos

- `api/smoke_auth.py`
- `scripts/verificar_fase14_api_auth.ps1`

## Requisitos previos

1. La API debe estar instalada.
2. `api/.env` debe existir y contener las variables que ya usa `api/app/config.py`.
3. Debe existir al menos un usuario real en Supabase Auth con membresía activa.
4. El servidor local debe estar levantado en `http://127.0.0.1:8000`.

## Ejecución

Terminal 1:

```powershell
.\api\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000
```

Terminal 2:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
Unblock-File .\scripts\verificar_fase14_api_auth.ps1
.\scripts\verificar_fase14_api_auth.ps1
```

El script solicitará:

- correo de un usuario existente de Supabase Auth;
- contraseña del usuario.

La contraseña se usa solo en memoria para obtener una sesión de Supabase y no se guarda ni se imprime.

También puede indicarse el correo por argumento:

```powershell
.\scripts\verificar_fase14_api_auth.ps1 --email "usuario@correo.com"
```

Para probar una empresa concreta:

```powershell
.\scripts\verificar_fase14_api_auth.ps1 `
  --email "usuario@correo.com" `
  --empresa-id "UUID-DE-LA-EMPRESA"
```

## Qué valida

- `/api/v1/health` -> 200.
- `/api/v1/health/db` -> 200.
- `/api/v1/auth/me` sin token -> 401.
- Login real en Supabase Auth.
- `/api/v1/auth/me` con Bearer token -> 200.
- Membresías activas y sincronizadas.
- `X-Empresa-Id` ajeno -> 403.
- `/api/v1/ai/summary`.
- `/api/v1/ai/insights`.
- `/api/v1/ai/forecasts/sales`.
- `/api/v1/ai/forecasts/demand`.
- `/api/v1/ai/inventory/recommendations`.
- `/api/v1/ai/dashboard`.

No modifica datos de negocio ni genera nuevas ejecuciones IA.
