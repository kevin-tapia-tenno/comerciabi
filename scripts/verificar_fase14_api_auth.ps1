$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== ComercioBI - Fase 14.14C / Auth E2E ===" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot "api\.venv\Scripts\python.exe"
$Smoke = Join-Path $ProjectRoot "api\smoke_auth.py"

if (-not (Test-Path $Python)) {
    throw "No existe api/.venv. Ejecuta primero la instalación de la API."
}

if (-not (Test-Path $Smoke)) {
    throw "Falta api/smoke_auth.py."
}

if (-not (Test-Path ".\api\.env")) {
    throw "Falta api/.env."
}

Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"
Write-Host ""

& $Python $Smoke @args

if ($LASTEXITCODE -ne 0) {
    throw "La validación autenticada de Fase 14.14C falló."
}

Write-Host ""
Write-Host "Fase 14.14C completada correctamente." -ForegroundColor Green
