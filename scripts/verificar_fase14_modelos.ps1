$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EtlDir = Join-Path $ProjectRoot "etl"
$PythonExe = Join-Path $EtlDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "No se encontró el entorno virtual en: $PythonExe"
}

Write-Host "=== ComercioBI - Verificación Fase 14 / XGBoost ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $PythonExe"
Write-Host ""

Push-Location $EtlDir
try {
    & $PythonExe -m src.ai.train_xgboost
    if ($LASTEXITCODE -ne 0) {
        throw "Entrenamiento XGBoost terminó con código $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Verificación XGBoost completada correctamente." -ForegroundColor Green
