$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$etlDir = Join-Path $projectRoot "etl"
$venvDir = Join-Path $etlDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"
$requirements = Join-Path $etlDir "requirements.txt"

Write-Host "=== ComercioBI - Preparar Fase 12 ==="
Write-Host "Proyecto: $projectRoot"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python no está disponible en PATH. Instálalo o reinicia VS Code."
}

Write-Host "Versión de Python:"
python --version

if (-not (Test-Path $venvDir)) {
    Write-Host "Creando entorno virtual en etl\.venv..."
    python -m venv $venvDir
}
else {
    Write-Host "El entorno virtual ya existe. Se reutilizará."
}

Write-Host "Actualizando pip..."
& $pythonExe -m pip install --upgrade pip

Write-Host "Instalando dependencias..."
& $pythonExe -m pip install -r $requirements

Write-Host "Verificando importaciones..."
& $pythonExe -c "import pandas, sqlalchemy, psycopg, dotenv; print('Dependencias Python: OK')"

Write-Host ""
Write-Host "Preparación terminada."
Write-Host "Siguiente paso: crear etl\.env a partir de etl\.env.example."
