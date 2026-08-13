param(
    [string]$ProjectRoot = "C:\Users\HP\Desktop\Proyectos\comerciabi"
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $ProjectRoot)) {
    throw "No existe el proyecto: $ProjectRoot"
}

if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
    throw "La ruta no parece ser el repositorio ComercioBI: $ProjectRoot"
}

$RelativeFiles = @(
    "etl\src\ai\finalize_forecasts.py",
    "scripts\verificar_fase14_pronosticos_finales.ps1"
)

Write-Host ""
Write-Host "=== Aplicando patch ComercioBI Fase 14.11C.2 ===" -ForegroundColor Cyan

foreach ($RelativeFile in $RelativeFiles) {
    $Source = Join-Path $PatchRoot $RelativeFile
    $Destination = Join-Path $ProjectRoot $RelativeFile
    $DestinationDirectory = Split-Path -Parent $Destination

    if (-not (Test-Path $Source)) {
        throw "Falta archivo dentro del patch: $RelativeFile"
    }

    New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
    Copy-Item -Path $Source -Destination $Destination -Force
    Write-Host "- Instalado: $RelativeFile"
}

Write-Host ""
Write-Host "Patch aplicado correctamente." -ForegroundColor Green
Write-Host "Siguiente comando dentro del repositorio:"
Write-Host ".\scripts\verificar_fase14_pronosticos_finales.ps1"
