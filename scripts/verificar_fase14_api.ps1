$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== ComercioBI - Fase 14.14B / Verificacion API FastAPI ===" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot "api\.venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Host "Aun no existe api/.venv." -ForegroundColor Yellow
    Write-Host "Crealo con:"
    Write-Host "  py -3.14 -m venv .\api\.venv"
    Write-Host "  .\api\.venv\Scripts\python.exe -m pip install -e `".[dev]`""
    exit 2
}

Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"

$RequiredFiles = @(
    ".python-version",
    "pyproject.toml",
    "vercel.json",
    "api\index.py",
    "api\app\main.py",
    "api\app\config.py",
    "api\app\database.py",
    "api\app\security.py",
    "api\app\tenancy.py",
    "api\app\repository.py",
    "database\migrations\022_api_readonly_role.sql"
)

Write-Host ""
Write-Host "[1/4] Validando archivos..." -ForegroundColor Yellow
foreach ($File in $RequiredFiles) {
    if (-not (Test-Path $File)) {
        throw "Falta archivo requerido: $File"
    }
}
Write-Host "Archivos base: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[2/4] Validando sintaxis Python..." -ForegroundColor Yellow
& $Python -m compileall -q .\api
if ($LASTEXITCODE -ne 0) {
    throw "Fallo compileall."
}
Write-Host "Sintaxis Python: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Validando api/.env..." -ForegroundColor Yellow
if (Test-Path ".\api\.env") {
    Write-Host "api/.env: encontrado" -ForegroundColor Green
} else {
    Write-Host "api/.env: AUN NO EXISTE" -ForegroundColor Yellow
    Write-Host "Copia api/.env.example -> api/.env antes de levantar la API."
}

Write-Host ""
Write-Host "[4/4] Comandos siguientes..." -ForegroundColor Yellow
Write-Host 'Instalar: .\api\.venv\Scripts\python.exe -m pip install -e ".[dev]"'
Write-Host 'Arrancar: .\api\.venv\Scripts\python.exe -m uvicorn api.index:app --reload --port 8000'
Write-Host 'Swagger:  http://127.0.0.1:8000/api/docs'
Write-Host 'Health:   http://127.0.0.1:8000/api/v1/health'
Write-Host ""
Write-Host "Fase 14.14B - estructura validada correctamente." -ForegroundColor Green
