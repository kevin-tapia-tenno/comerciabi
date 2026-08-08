$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$etlDir = Join-Path $projectRoot "etl"
$pythonExe = Join-Path $etlDir ".venv\Scripts\python.exe"

Write-Host "=== Verificación local - Fase 12 ==="

if (-not (Test-Path $pythonExe)) {
    throw "Falta etl\.venv. Ejecuta .\scripts\preparar_fase12.ps1"
}

Write-Host "1/4 - Python"
& $pythonExe --version

Write-Host "2/4 - Compilación de módulos"
& $pythonExe -m compileall -q (Join-Path $etlDir "src")

Write-Host "3/4 - Dependencias"
& $pythonExe -c "import pandas, sqlalchemy, psycopg, dotenv; print('Dependencias: OK')"

Write-Host "4/4 - Estado Git"
Set-Location $projectRoot
git status

Write-Host "Verificación local completada."
