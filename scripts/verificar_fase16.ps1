$ErrorActionPreference = "Stop"

function Assert-ExitCode {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step fallo con codigo de salida $LASTEXITCODE."
    }
}

Write-Host ""
Write-Host "=== ComercioBI - Fase 16 / CI baseline ===" -ForegroundColor Cyan

$RepoRoot = (git rev-parse --show-toplevel 2>$null)
Assert-ExitCode "Detectar raiz Git"
Set-Location $RepoRoot

Write-Host ""
Write-Host "[1/6] Estado Git" -ForegroundColor Yellow
git status --short
Assert-ExitCode "git status"

Write-Host ""
Write-Host "[2/6] Versiones" -ForegroundColor Yellow
node --version
Assert-ExitCode "node --version"
npm --version
Assert-ExitCode "npm --version"

$PythonCandidates = @(
    (Join-Path $RepoRoot "api\\.venv\\Scripts\\python.exe"),
    (Join-Path $RepoRoot ".venv\\Scripts\\python.exe")
)
$PythonExe = $null
foreach ($Candidate in $PythonCandidates) {
    if (Test-Path $Candidate) { $PythonExe = $Candidate; break }
}
if (-not $PythonExe) { $PythonExe = "python" }

& $PythonExe --version
Assert-ExitCode "python --version"

Write-Host ""
Write-Host "[3/6] Frontend lint" -ForegroundColor Yellow
npm run lint
Assert-ExitCode "npm run lint"

Write-Host ""
Write-Host "[4/6] Frontend build" -ForegroundColor Yellow
npm run build
Assert-ExitCode "npm run build"

Write-Host ""
Write-Host "[5/6] Backend pytest" -ForegroundColor Yellow
& $PythonExe -m pytest -q
Assert-ExitCode "pytest"

Write-Host ""
Write-Host "[6/6] Verificaciones Git" -ForegroundColor Yellow
git diff --check
Assert-ExitCode "git diff --check"

Write-Host ""
Write-Host "FASE 16 baseline local: OK" -ForegroundColor Green
Write-Host "Lint, build y pytest completados correctamente." -ForegroundColor Green
