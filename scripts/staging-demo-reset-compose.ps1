[CmdletBinding()]
param(
    [string]$EnvFile = "",

    [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $root "deploy\compose\docker-compose.staging.yml"
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $root ".env.staging.local"
}
$EnvFile = [System.IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "staging env file not found; create a repository-ignored file from .env.staging.example"
}

$mode = if ($Apply) { "--apply" } else { "--dry-run" }
docker compose --env-file $EnvFile -f $composeFile --profile demo-reset `
    run --rm -e "STAGING_DEMO_RESET_MODE=$mode" demo-reset
if ($LASTEXITCODE -ne 0) {
    throw "staging demo reset Compose run failed"
}
