$ErrorActionPreference = "Stop"

$ProjectRoot = (
    Resolve-Path (
        Join-Path $PSScriptRoot ".."
    )
).Path

$Python = Join-Path `
    $ProjectRoot `
    "etl\.venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    throw "No se encontró Python del entorno virtual: $Python"
}

Write-Host ""
Write-Host "=== ComercioBI - Verificación Fase 14 / Incertidumbre ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Python: $Python"
Write-Host ""

Push-Location $ProjectRoot

try {
    & $Python -m etl.src.ai.calibrate_uncertainty

    if ($LASTEXITCODE -ne 0) {
        throw "Falló la calibración de incertidumbre."
    }

    $MetadataPath = Join-Path `
        $ProjectRoot `
        "etl\output\ai\interval_calibration.json"

    if (-not (Test-Path $MetadataPath)) {
        throw "No se generó interval_calibration.json."
    }

    $Metadata = Get-Content `
        $MetadataPath `
        -Raw `
        | ConvertFrom-Json

    if ($Metadata.sales.calibration_rows -lt 20) {
        throw "Ventas tiene menos de 20 observaciones de calibración."
    }

    if ($Metadata.demand.calibration_rows -lt 20) {
        throw "Demanda tiene menos de 20 observaciones de calibración."
    }

    if ($Metadata.sales.absolute_error_quantile -lt 0) {
        throw "El intervalo de ventas tiene amplitud negativa."
    }

    if ($Metadata.demand.absolute_error_quantile -lt 0) {
        throw "El intervalo de demanda tiene amplitud negativa."
    }

    Write-Host ""
    Write-Host "Validaciones:" -ForegroundColor Cyan

    Write-Host (
        "- Champion ventas: " +
        $Metadata.sales.champion.ToUpper()
    )

    Write-Host (
        "- Filas ventas: " +
        $Metadata.sales.calibration_rows
    )

    Write-Host (
        "- Champion demanda: " +
        $Metadata.demand.champion.ToUpper()
    )

    Write-Host (
        "- Filas demanda: " +
        $Metadata.demand.calibration_rows
    )

    Write-Host (
        "- Cobertura nominal: " +
        ([math]::Round(
            $Metadata.policy.nominal_coverage * 100,
            2
        )) +
        "%"
    )

    Write-Host ""
    Write-Host "Fase 14.11C.1 validada correctamente." -ForegroundColor Green
}
finally {
    Pop-Location
}