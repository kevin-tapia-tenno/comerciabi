$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot "etl\.venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    throw "No se encontró el Python del entorno virtual: $Python"
}

Push-Location $ProjectRoot

try {
    Write-Host ""
    Write-Host "=== ComercioBI - Fase 14 / Generación de pronósticos futuros ===" -ForegroundColor Cyan

    & $Python -m etl.src.ai.forecast_future

    if ($LASTEXITCODE -ne 0) {
        throw "Falló la generación de pronósticos futuros."
    }

    Write-Host ""
    Write-Host "=== ComercioBI - Fase 14 / Validación de pronósticos ===" -ForegroundColor Cyan

    & $Python -m etl.src.ai.validate_forecasts

    if ($LASTEXITCODE -ne 0) {
        throw "Falló la validación de pronósticos futuros."
    }

    Write-Host ""
    Write-Host "Fase 14.11 validada correctamente." -ForegroundColor Green
}
finally {
    Pop-Location
}
