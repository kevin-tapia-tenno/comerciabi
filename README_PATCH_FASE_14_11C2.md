# ComercioBI - Patch Fase 14.11C.2

Este patch agrega la finalizacion de los pronosticos futuros con bandas de incertidumbre.

## Archivos nuevos

- `etl/src/ai/finalize_forecasts.py`
- `scripts/verificar_fase14_pronosticos_finales.ps1`

No reemplaza los archivos ya validados de 14.11C.1.

## Aplicacion rapida

1. Extrae este ZIP.
2. Abre PowerShell en la carpeta extraida.
3. Ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\APLICAR_PATCH.ps1
```

4. Vuelve al repositorio:

```powershell
cd C:\Users\HP\Desktop\Proyectos\comerciabi
```

5. Activa el entorno virtual si no esta activo:

```powershell
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& .\etl\.venv\Scripts\Activate.ps1)
```

6. Ejecuta:

```powershell
.\scripts\verificar_fase14_pronosticos_finales.ps1
```

## Resultado esperado

El script:

1. Regenera y valida pronosticos futuros.
2. Recalibra los intervalos usando el holdout.
3. Aplica `limite_inferior` y `limite_superior`.
4. Valida filas, horizontes, productos, no negativos, coherencia de intervalos, duplicados, metadata y que PostgreSQL siga sin escritura.

Al final debe mostrar:

`Fase 14.11C.2 validada correctamente.`

## Importante

No hacer `git add`, commit ni push hasta validar este bloque.

La persistencia en PostgreSQL pertenece al siguiente bloque: Fase 14.11D.
