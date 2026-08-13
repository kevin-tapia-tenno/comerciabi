$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot "etl\.venv\Scripts\python.exe"
$PersistScript = Join-Path $ProjectRoot "etl\src\ai\persist_forecasts.py"

Write-Host ""
Write-Host "=== ComercioBI - Verificacion Fase 14 / Persistencia PostgreSQL ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"
Write-Host ""

if (-not (Test-Path $Python)) {
    throw "No existe el Python del entorno virtual: $Python"
}

if (-not (Test-Path $PersistScript)) {
    throw "No existe el persistidor: $PersistScript"
}

Write-Host "[1/2] Persistiendo pronosticos validados..." -ForegroundColor Yellow

& $Python $PersistScript

if ($LASTEXITCODE -ne 0) {
    throw "La persistencia PostgreSQL fallo."
}

Write-Host ""
Write-Host "[2/2] Persistencia ejecutada." -ForegroundColor Yellow
Write-Host ""
Write-Host "Ahora valida en Supabase las tablas:" -ForegroundColor Cyan
Write-Host "  analytics.ai_ejecuciones"
Write-Host "  analytics.ai_pronostico_ventas"
Write-Host "  analytics.ai_pronostico_demanda"
Write-Host ""
Write-Host "Fase 14.11D - ejecucion local completada." -ForegroundColor Green