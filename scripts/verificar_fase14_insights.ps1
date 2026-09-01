$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot "etl\.venv\Scripts\python.exe"

Write-Host ""
Write-Host "=== ComercioBI - Fase 14.13 / Business Insights ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"
Write-Host ""

if (-not (Test-Path $Python)) {
    throw "No se encontro el Python del entorno virtual: $Python"
}

Push-Location $ProjectRoot
try {
    Write-Host "[1/2] Generando y persistiendo insights..." -ForegroundColor Yellow
    & $Python ".\etl\src\ai\generate_business_insights.py"
    if ($LASTEXITCODE -ne 0) { throw "Fallo generate_business_insights.py" }

    Write-Host ""
    Write-Host "[2/2] Validando serving layer y artefactos..." -ForegroundColor Yellow
    & $Python ".\etl\src\ai\validate_business_insights.py"
    if ($LASTEXITCODE -ne 0) { throw "Fallo validate_business_insights.py" }

    Write-Host ""
    Write-Host "Fase 14.13 completada correctamente." -ForegroundColor Green
}
finally {
    Pop-Location
}
