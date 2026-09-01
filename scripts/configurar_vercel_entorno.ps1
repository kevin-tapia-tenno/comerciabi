[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("preview", "production")]
    [string]$Environment,

    [string]$Branch = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"


# ============================================================
# Rutas
# ============================================================

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiEnvPath = Join-Path $repoRoot "api\.env"

Set-Location $repoRoot


# ============================================================
# Funciones
# ============================================================

function Read-DotEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        throw "No existe el archivo: $Path"
    }

    $values = @{}

    foreach ($line in Get-Content $Path -Encoding UTF8) {
        $trimmed = $line.Trim()

        if (
            [string]::IsNullOrWhiteSpace($trimmed) -or
            $trimmed.StartsWith("#")
        ) {
            continue
        }

        $separator = $trimmed.IndexOf("=")

        if ($separator -lt 1) {
            continue
        }

        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()

        if (
            $value.Length -ge 2 -and
            (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
            )
        ) {
            $value = $value.Substring(
                1,
                $value.Length - 2
            )
        }

        $values[$name] = $value
    }

    return $values
}


function Assert-Value {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Values,

        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (
        -not $Values.ContainsKey($Name) -or
        [string]::IsNullOrWhiteSpace($Values[$Name])
    ) {
        throw "Falta $Name en api/.env"
    }
}


function Set-VercelVariable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Value,

        [Parameter(Mandatory = $true)]
        [string]$Target,

        [string]$GitBranch = "",

        [switch]$Sensitive
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "No se puede configurar $Name con un valor vacío."
    }

    Write-Host "Configurando $Name..." -ForegroundColor Cyan

    $arguments = @(
        "env",
        "add",
        $Name,
        $Target
    )

    if (
        $Target -eq "preview" -and
        -not [string]::IsNullOrWhiteSpace($GitBranch)
    ) {
        $arguments += $GitBranch
    }

    $arguments += "--force"

    if ($Sensitive) {
        $arguments += "--sensitive"
    }

    $Value | & vercel @arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Vercel devolvió error configurando $Name."
    }
}


# ============================================================
# Preparación
# ============================================================

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "ComercioBI - Configuración Vercel" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

if (
    $Environment -eq "preview" -and
    [string]::IsNullOrWhiteSpace($Branch)
) {
    $Branch = (git branch --show-current).Trim()

    if ([string]::IsNullOrWhiteSpace($Branch)) {
        throw "No se pudo determinar la rama Git actual."
    }
}

Write-Host "Entorno: $Environment" -ForegroundColor Yellow

if ($Environment -eq "preview") {
    Write-Host "Rama:    $Branch" -ForegroundColor Yellow
}

Write-Host ""

$apiEnv = Read-DotEnv -Path $apiEnvPath


# ============================================================
# Validación
# ============================================================

$required = @(
    "SUPABASE_URL",
    "SUPABASE_JWT_AUDIENCE",
    "SUPABASE_PUBLISHABLE_KEY",
    "API_DB_HOST",
    "API_DB_PORT",
    "API_DB_NAME",
    "API_DB_USER",
    "API_DB_PASSWORD",
    "API_DB_SSLMODE"
)

foreach ($name in $required) {
    Assert-Value `
        -Values $apiEnv `
        -Name $name
}


# ============================================================
# Variables FastAPI
# ============================================================

$variables = [ordered]@{
    "APP_ENV" = "production"
    "LOG_LEVEL" = "INFO"

    "SUPABASE_URL" =
        $apiEnv["SUPABASE_URL"]

    "SUPABASE_JWT_AUDIENCE" =
        $apiEnv["SUPABASE_JWT_AUDIENCE"]

    "SUPABASE_PUBLISHABLE_KEY" =
        $apiEnv["SUPABASE_PUBLISHABLE_KEY"]

    "API_DB_HOST" =
        $apiEnv["API_DB_HOST"]

    "API_DB_PORT" =
        $apiEnv["API_DB_PORT"]

    "API_DB_NAME" =
        $apiEnv["API_DB_NAME"]

    "API_DB_USER" =
        $apiEnv["API_DB_USER"]

    "API_DB_SSLMODE" =
        $apiEnv["API_DB_SSLMODE"]
}


foreach ($item in $variables.GetEnumerator()) {
    Set-VercelVariable `
        -Name $item.Key `
        -Value $item.Value `
        -Target $Environment `
        -GitBranch $Branch
}


# ============================================================
# Password PostgreSQL
# ============================================================

Set-VercelVariable `
    -Name "API_DB_PASSWORD" `
    -Value $apiEnv["API_DB_PASSWORD"] `
    -Target $Environment `
    -GitBranch $Branch `
    -Sensitive


# ============================================================
# CORS
# ============================================================

$corsOrigins = if (
    $apiEnv.ContainsKey("CORS_ORIGINS") -and
    -not [string]::IsNullOrWhiteSpace(
        $apiEnv["CORS_ORIGINS"]
    )
) {
    $apiEnv["CORS_ORIGINS"]
}
else {
    "http://localhost:5173,http://127.0.0.1:5173"
}

Set-VercelVariable `
    -Name "CORS_ORIGINS" `
    -Value $corsOrigins `
    -Target $Environment `
    -GitBranch $Branch


# ============================================================
# Variables Vite
# ============================================================

Set-VercelVariable `
    -Name "VITE_SUPABASE_URL" `
    -Value $apiEnv["SUPABASE_URL"] `
    -Target $Environment `
    -GitBranch $Branch

Set-VercelVariable `
    -Name "VITE_SUPABASE_PUBLISHABLE_KEY" `
    -Value $apiEnv["SUPABASE_PUBLISHABLE_KEY"] `
    -Target $Environment `
    -GitBranch $Branch


# ============================================================
# Resultado
# ============================================================

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Configuración completada." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

if ($Environment -eq "preview") {
    vercel env ls preview $Branch
}
else {
    vercel env ls production
}