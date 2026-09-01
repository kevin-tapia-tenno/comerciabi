$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== ComercioBI - Fase 15 / Usuarios y roles ===" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$RequiredFiles = @(
    "database\migrations\023_usuarios_roles_admin.sql",
    "database\tests\014_verificaciones_usuarios_roles.sql",
    "api\app\admin_models.py",
    "api\app\supabase_admin.py",
    "src\lib\admin-service.ts",
    "src\pages\UsersPage.tsx",
    "src\pages\AcceptInvitePage.tsx",
    "src\styles\users.css",
    "src\types\admin.ts"
)

Write-Host ""
Write-Host "[1/6] Validando archivos de la fase..." -ForegroundColor Yellow
foreach ($File in $RequiredFiles) {
    if (-not (Test-Path $File)) {
        throw "Falta archivo requerido: $File"
    }
}
Write-Host "Archivos Fase 15: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[2/6] Validando secretos fuera de Git..." -ForegroundColor Yellow
$TrackedSecrets = git ls-files -- ".env.local" "api/.env" "etl/.env"
if ($TrackedSecrets) {
    throw "Hay archivos de secretos trackeados por Git: $TrackedSecrets"
}
Write-Host "Archivos .env sensibles no están trackeados: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[3/6] Validando Python y API..." -ForegroundColor Yellow
$Python = Join-Path $ProjectRoot "api\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    throw "No existe api/.venv. Créalo/instálalo antes de verificar Fase 15."
}

& $Python -m compileall -q .\api
if ($LASTEXITCODE -ne 0) {
    throw "Fallo compileall de la API."
}

& $Python -m pytest -q
if ($LASTEXITCODE -ne 0) {
    throw "Fallaron las pruebas de API."
}
Write-Host "API Python: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[4/6] Validando frontend..." -ForegroundColor Yellow
if (-not (Test-Path ".\node_modules")) {
    throw "Falta node_modules. Ejecuta npm install antes de verificar."
}

npm run build
if ($LASTEXITCODE -ne 0) {
    throw "Falló npm run build."
}

npm run lint
if ($LASTEXITCODE -ne 0) {
    throw "Falló npm run lint."
}
Write-Host "Frontend: OK" -ForegroundColor Green

Write-Host ""
Write-Host "[5/6] Revisando configuración local de invitaciones..." -ForegroundColor Yellow
if (-not (Test-Path ".\api\.env")) {
    Write-Host "api/.env no existe todavía." -ForegroundColor Yellow
} else {
    $SecretConfigured = Select-String -Path ".\api\.env" -Pattern '^SUPABASE_SECRET_KEY=.+$' -Quiet
    $PublicUrlConfigured = Select-String -Path ".\api\.env" -Pattern '^APP_PUBLIC_URL=.+$' -Quiet

    if ($SecretConfigured) {
        Write-Host "SUPABASE_SECRET_KEY: configurada (valor oculto)" -ForegroundColor Green
    } else {
        Write-Host "SUPABASE_SECRET_KEY: FALTA configurar" -ForegroundColor Yellow
    }

    if ($PublicUrlConfigured) {
        Write-Host "APP_PUBLIC_URL: configurada" -ForegroundColor Green
    } else {
        Write-Host "APP_PUBLIC_URL: FALTA configurar" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[6/6] Recordatorio de base de datos..." -ForegroundColor Yellow
Write-Host "Confirma que ejecutaste en Supabase SQL Editor:"
Write-Host "  1. database/migrations/023_usuarios_roles_admin.sql"
Write-Host "  2. database/tests/014_verificaciones_usuarios_roles.sql"

Write-Host ""
Write-Host "Validación técnica local de Fase 15 completada." -ForegroundColor Green
Write-Host "Falta la prueba E2E: invitar -> aceptar invitación -> login -> validar rol/RLS."
