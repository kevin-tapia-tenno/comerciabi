$ErrorActionPreference = "Stop"

$ProjectRoot = (
    Resolve-Path (
        Join-Path $PSScriptRoot ".."
    )
).Path

$Python = Join-Path `
    $ProjectRoot `
    "etl\.venv\Scripts\python.exe"

$ForecastScript = Join-Path `
    $ProjectRoot `
    "scripts\verificar_fase14_pronosticos.ps1"

$IntervalScript = Join-Path `
    $ProjectRoot `
    "scripts\verificar_fase14_intervalos.ps1"

$SalesPath = Join-Path `
    $ProjectRoot `
    "etl\output\ai\future_sales_forecast.csv"

$DemandPath = Join-Path `
    $ProjectRoot `
    "etl\output\ai\future_demand_forecast.csv"

$MetadataPath = Join-Path `
    $ProjectRoot `
    "etl\output\ai\future_forecast_metadata.json"

if (-not (Test-Path $Python)) {
    throw "No se encontro Python del entorno virtual: $Python"
}

if (-not (Test-Path $ForecastScript)) {
    throw "No existe el script previo: $ForecastScript"
}

if (-not (Test-Path $IntervalScript)) {
    throw "No existe el script previo: $IntervalScript"
}

Write-Host ""
Write-Host "=== ComercioBI - Fase 14 / Pronosticos finales con intervalos ===" -ForegroundColor Cyan
Write-Host "Proyecto: $ProjectRoot"
Write-Host ""

Push-Location $ProjectRoot

try {
    Write-Host "[1/4] Regenerando y validando pronosticos base..." -ForegroundColor Cyan
    & $ForecastScript

    if (-not $?) {
        throw "Fallo el bloque de pronosticos futuros."
    }

    Write-Host ""
    Write-Host "[2/4] Recalibrando incertidumbre..." -ForegroundColor Cyan
    & $IntervalScript

    if (-not $?) {
        throw "Fallo el bloque de calibracion de incertidumbre."
    }

    Write-Host ""
    Write-Host "[3/4] Aplicando intervalos a los pronosticos..." -ForegroundColor Cyan
    & $Python -m etl.src.ai.finalize_forecasts

    if ($LASTEXITCODE -ne 0) {
        throw "Fallo la aplicacion de intervalos."
    }

    if (-not (Test-Path $SalesPath)) {
        throw "No existe future_sales_forecast.csv."
    }

    if (-not (Test-Path $DemandPath)) {
        throw "No existe future_demand_forecast.csv."
    }

    if (-not (Test-Path $MetadataPath)) {
        throw "No existe future_forecast_metadata.json."
    }

    Write-Host ""
    Write-Host "[4/4] Validando artefactos finales..." -ForegroundColor Cyan

    $Sales = Import-Csv $SalesPath
    $Demand = Import-Csv $DemandPath
    $Metadata = Get-Content $MetadataPath -Raw | ConvertFrom-Json

    if ($Sales.Count -le 0) {
        throw "El pronostico de ventas esta vacio."
    }

    if ($Demand.Count -le 0) {
        throw "El pronostico de demanda esta vacio."
    }

    $SalesRequired = @(
        "empresa_key",
        "producto_key",
        "periodo",
        "horizonte_meses",
        "venta_neta_pronosticada",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
        "model_version"
    )

    $DemandRequired = @(
        "empresa_key",
        "producto_key",
        "fecha",
        "horizonte_dias",
        "unidades_pronosticadas",
        "limite_inferior",
        "limite_superior",
        "modelo",
        "origen_datos",
        "model_version"
    )

    foreach ($Column in $SalesRequired) {
        if ($Sales[0].PSObject.Properties.Name -notcontains $Column) {
            throw "Falta columna en ventas: $Column"
        }
    }

    foreach ($Column in $DemandRequired) {
        if ($Demand[0].PSObject.Properties.Name -notcontains $Column) {
            throw "Falta columna en demanda: $Column"
        }
    }

    $InvalidSales = @(
        $Sales | Where-Object {
            ([double]$_.limite_inferior -lt 0) -or
            ([double]$_.venta_neta_pronosticada -lt 0) -or
            ([double]$_.limite_superior -lt 0) -or
            ([double]$_.limite_inferior -gt [double]$_.venta_neta_pronosticada) -or
            ([double]$_.venta_neta_pronosticada -gt [double]$_.limite_superior)
        }
    )

    if ($InvalidSales.Count -gt 0) {
        throw "Ventas contiene intervalos invalidos: $($InvalidSales.Count)"
    }

    $InvalidDemand = @(
        $Demand | Where-Object {
            ([double]$_.limite_inferior -lt 0) -or
            ([double]$_.unidades_pronosticadas -lt 0) -or
            ([double]$_.limite_superior -lt 0) -or
            ([double]$_.limite_inferior -gt [double]$_.unidades_pronosticadas) -or
            ([double]$_.unidades_pronosticadas -gt [double]$_.limite_superior)
        }
    )

    if ($InvalidDemand.Count -gt 0) {
        throw "Demanda contiene intervalos invalidos: $($InvalidDemand.Count)"
    }

    $SalesDuplicates = @(
        $Sales |
            Group-Object -Property empresa_key, producto_key, periodo |
            Where-Object Count -gt 1
    )

    if ($SalesDuplicates.Count -gt 0) {
        throw "Ventas contiene duplicados logicos: $($SalesDuplicates.Count)"
    }

    $DemandDuplicates = @(
        $Demand |
            Group-Object -Property empresa_key, producto_key, fecha |
            Where-Object Count -gt 1
    )

    if ($DemandDuplicates.Count -gt 0) {
        throw "Demanda contiene duplicados logicos: $($DemandDuplicates.Count)"
    }

    $SalesHorizons = @(
        $Sales.horizonte_meses |
            ForEach-Object { [int]$_ } |
            Sort-Object -Unique
    )

    if (($SalesHorizons -join ",") -ne "1,2,3") {
        throw "Horizontes de ventas incorrectos: $($SalesHorizons -join ',')"
    }

    $ExpectedDemandHorizons = 1..30
    $DemandHorizons = @(
        $Demand.horizonte_dias |
            ForEach-Object { [int]$_ } |
            Sort-Object -Unique
    )

    if (($DemandHorizons -join ",") -ne ($ExpectedDemandHorizons -join ",")) {
        throw "Horizontes de demanda incorrectos."
    }

    $SalesProducts = @(
        $Sales |
            Group-Object -Property empresa_key, producto_key
    )

    foreach ($Group in $SalesProducts) {
        if ($Group.Count -ne 3) {
            throw "Cada producto debe tener 3 pronosticos de ventas."
        }
    }

    $DemandProducts = @(
        $Demand |
            Group-Object -Property empresa_key, producto_key
    )

    foreach ($Group in $DemandProducts) {
        if ($Group.Count -ne 30) {
            throw "Cada producto debe tener 30 pronosticos de demanda."
        }
    }

    if (-not $Metadata.uncertainty.applied) {
        throw "El metadata no marca uncertainty.applied=true."
    }

    if ($Metadata.persistence.postgresql_written) {
        throw "La persistencia PostgreSQL no debe ocurrir todavia."
    }

    if ([double]$Metadata.uncertainty.nominal_coverage -ne 0.9) {
        throw "La cobertura nominal final no es 0.9."
    }

    Write-Host ""
    Write-Host "Resultado final:" -ForegroundColor Cyan
    Write-Host "- Ventas: $($Sales.Count) filas"
    Write-Host "- Productos ventas: $($SalesProducts.Count)"
    Write-Host "- Demanda: $($Demand.Count) filas"
    Write-Host "- Productos demanda: $($DemandProducts.Count)"
    Write-Host "- Intervalos invalidos ventas: $($InvalidSales.Count)"
    Write-Host "- Intervalos invalidos demanda: $($InvalidDemand.Count)"
    Write-Host "- Duplicados ventas: $($SalesDuplicates.Count)"
    Write-Host "- Duplicados demanda: $($DemandDuplicates.Count)"
    Write-Host "- Cobertura nominal: $([math]::Round([double]$Metadata.uncertainty.nominal_coverage * 100, 2))%"
    Write-Host "- Persistencia PostgreSQL: $($Metadata.persistence.postgresql_written)"
    Write-Host ""
    Write-Host "Fase 14.11C.2 validada correctamente." -ForegroundColor Green
}
finally {
    Pop-Location
}
