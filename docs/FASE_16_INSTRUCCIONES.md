# FASE 16 — QA, CI/CD y automatización

## Objetivo

Convertir ComercioBI en un proyecto con validaciones reproducibles y automáticas sin alterar la funcionalidad ya validada en las fases 0–15.

- **GitHub Actions:** integración continua, calidad y pruebas.
- **Vercel:** despliegues Preview y Production mediante la integración Git existente.
- **Supabase/PostgreSQL:** datos y autenticación.
- **Scripts locales:** validación antes de hacer push.

## 16.1 — Auditoría técnica inicial

Baseline validado:

- Rama `feat/fase-16-qa-cicd`.
- Árbol de trabajo limpio.
- Node 24.x y npm 11.x.
- Python 3.14.x mediante `.python-version`.
- `npm run lint`: OK.
- `npm run build`: OK.
- `python -m pytest -q`: 8 tests aprobados.
- Suite API en `tests/api/`.
- Tests SQL en `database/tests/001...014`.
- `.github/` no existía antes de Fase 16.
- `.env.local` y `api/.env` ignorados por Git.
- El CI base no requiere secretos reales.

### Tests SQL

Los `database/tests/*.sql` son pruebas de integración contra PostgreSQL/Supabase. Se dejan fuera del CI base y se incorporarán en una subfase posterior con una estrategia segura.

## 16.2 — CI base reproducible

Se crean:

- `.github/workflows/ci.yml`
- `scripts/verificar_fase16.ps1`

### Frontend

1. Checkout.
2. Node 24.
3. `npm ci`.
4. `npm run lint`.
5. `npm run build`.

### Backend

1. Checkout.
2. Python desde `.python-version`.
3. Instalación `.[dev]`.
4. `pip check`.
5. `pytest -q`.

### Seguridad inicial

- Permiso mínimo `contents: read`.
- No se usa `pull_request_target`.
- No se cargan secretos de producción.
- Los jobs tienen timeout.
- Runs sucesivos de la misma referencia cancelan el anterior.

## Verificación local

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\scripts\verificar_fase16.ps1
```

Esperado:

```text
FASE 16 baseline local: OK
Lint, build y pytest completados correctamente.
```

## Estado

- 16.1 Auditoría técnica: COMPLETADA.
- 16.2 CI base: EN IMPLEMENTACIÓN.
