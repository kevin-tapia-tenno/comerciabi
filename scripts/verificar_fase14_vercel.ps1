[CmdletBinding()]
param(
    [string]$BaseUrl = "https://comerciabi.vercel.app"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")


function Assert-StatusCode {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [Parameter(Mandatory = $true)]
        [int]$Expected
    )

    $response = Invoke-WebRequest `
        -Uri $Url `
        -Method Get `
        -UseBasicParsing

    if ($response.StatusCode -ne $Expected) {
        throw (
            "HTTP inesperado para {0}. Esperado={1}, recibido={2}" -f `
                $Url,
                $Expected,
                $response.StatusCode
        )
    }

    Write-Host `
        "[OK] $Url -> HTTP $($response.StatusCode)" `
        -ForegroundColor Green
}


Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "ComercioBI - Verificación Vercel" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Base URL: $BaseUrl"
Write-Host ""


# ============================================================
# Frontend / SPA
# ============================================================

Assert-StatusCode `
    -Url "$BaseUrl/" `
    -Expected 200

Assert-StatusCode `
    -Url "$BaseUrl/login" `
    -Expected 200

Assert-StatusCode `
    -Url "$BaseUrl/dashboard" `
    -Expected 200


# ============================================================
# API
# ============================================================

$health = Invoke-RestMethod `
    -Uri "$BaseUrl/api/v1/health" `
    -Method Get

if ($health.status -ne "ok") {
    throw "Health API no devolvió status=ok."
}

Write-Host "[OK] Health API" -ForegroundColor Green


$healthDb = Invoke-RestMethod `
    -Uri "$BaseUrl/api/v1/health/db" `
    -Method Get

if ($healthDb.status -ne "ok") {
    throw "Health DB no devolvió status=ok."
}

Write-Host "[OK] Health DB" -ForegroundColor Green


# ============================================================
# Auth requerida
# ============================================================

try {
    Invoke-RestMethod `
        -Uri "$BaseUrl/api/v1/auth/me" `
        -Method Get

    throw "/auth/me respondió sin requerir autenticación."
}
catch {
    $response = $_.Exception.Response

    if ($null -eq $response) {
        throw
    }

    $statusCode = [int]$response.StatusCode

    if ($statusCode -ne 401) {
        throw (
            "/auth/me devolvió HTTP {0}; se esperaba 401." -f `
                $statusCode
        )
    }

    Write-Host `
        "[OK] Auth sin token -> HTTP 401" `
        -ForegroundColor Green
}


Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host `
    "Fase 14.14D - infraestructura validada." `
    -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan