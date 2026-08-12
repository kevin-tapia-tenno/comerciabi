$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "=== Verificacion local - Fase 13 ==="

$requiredFiles = @(
    "database\tests\012_verificaciones_powerbi.sql",
    "docs\FASE_13_INSTRUCCIONES.md",
    "docs\powerbi\08_modelo_semantico_powerbi.md",
    "powerbi\README.md",
    "powerbi\dax\00_columnas_calculadas_fecha.dax",
    "powerbi\dax\01_medidas_ventas.dax",
    "powerbi\dax\02_medidas_inventario.dax",
    "powerbi\dax\03_medidas_tiempo.dax",
    "powerbi\power-query\ConexionPostgreSQL.m",
    "powerbi\power-query\Fecha.m",
    "powerbi\power-query\Empresa.m",
    "powerbi\power-query\Cliente.m",
    "powerbi\power-query\Producto.m",
    "powerbi\power-query\Vendedor.m",
    "powerbi\power-query\Canal.m",
    "powerbi\power-query\Almacen.m",
    "powerbi\power-query\Ventas.m",
    "powerbi\power-query\Inventario.m",
    "powerbi\theme\comerciabi_theme.json"
)

$missing = @()

foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Faltan archivos obligatorios:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host "Recursos versionables: OK" -ForegroundColor Green

$pbix = "powerbi\comerciabi.pbix"

if (Test-Path $pbix) {
    $size = (Get-Item $pbix).Length
    if ($size -le 0) {
        Write-Host "El PBIX existe pero esta vacio." -ForegroundColor Red
        exit 1
    }

    Write-Host ("PBIX encontrado: {0:N2} MB" -f ($size / 1MB)) -ForegroundColor Green
}
else {
    Write-Host "PBIX pendiente: powerbi\comerciabi.pbix" -ForegroundColor Yellow
    Write-Host "Guarda el informe de Power BI antes de cerrar la fase." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Estado Git:"
git status

Write-Host ""
Write-Host "Verificacion local completada."
