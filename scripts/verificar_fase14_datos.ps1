$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EtlDir = Join-Path $ProjectRoot "etl"
$PythonExe = Join-Path $EtlDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "No se encontró el entorno virtual en: $PythonExe"
}

Write-Host "=== ComercioBI - Verificación Fase 14 / Datos IA ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $PythonExe"
Write-Host ""

Push-Location $EtlDir

try {
    & $PythonExe -m src.ai.main

    if ($LASTEXITCODE -ne 0) {
        throw "La preparación de datos de IA terminó con código $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Verificación de datos IA completada correctamente." -ForegroundColor Green
