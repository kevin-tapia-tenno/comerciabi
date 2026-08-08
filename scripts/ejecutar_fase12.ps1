param(
    [switch]$DryRun,
    [switch]$NoExport
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$etlDir = Join-Path $projectRoot "etl"
$pythonExe = Join-Path $etlDir ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "No existe etl\.venv. Ejecuta primero .\scripts\preparar_fase12.ps1"
}

Push-Location $etlDir
try {
    $arguments = @("-m", "src.main")

    if ($DryRun) {
        $arguments += "--dry-run"
    }

    if ($NoExport) {
        $arguments += "--no-export"
    }

    & $pythonExe @arguments
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}
