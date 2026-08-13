$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot "etl\.venv\Scripts\python.exe"

$Generator = Join-Path `
    $ProjectRoot `
    "etl\src\ai\recommend_inventory.py"

$Validator = Join-Path `
    $ProjectRoot `
    "etl\src\ai\validate_inventory_recommendations.py"


Write-Host ""
Write-Host "=== ComercioBI - Fase 14 / Recomendaciones de inventario ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"
Write-Host ""


if (-not (Test-Path $Python)) {
    throw "No existe Python del entorno virtual: $Python"
}

if (-not (Test-Path $Generator)) {
    throw "No existe: $Generator"
}

if (-not (Test-Path $Validator)) {
    throw "No existe: $Validator"
}


Write-Host "[1/2] Generando recomendaciones..." -ForegroundColor Yellow

& $Python $Generator

if ($LASTEXITCODE -ne 0) {
    throw "Falló la generación de recomendaciones."
}


Write-Host ""
Write-Host "[2/2] Validando recomendaciones..." -ForegroundColor Yellow

& $Python $Validator

if ($LASTEXITCODE -ne 0) {
    throw "Falló la validación de recomendaciones."
}


Write-Host ""
Write-Host "Fase 14.12 validada correctamente." -ForegroundColor Green