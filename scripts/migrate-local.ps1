[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot

# This helper has one safe target: deploy/compose/docker-compose.local.yml.
# Override inherited shell values so a developer cannot accidentally point it at staging.
$env:NODE_ENV = "development"
$env:MYSQL_HOST = "127.0.0.1"
$env:MYSQL_PORT = "3306"
$env:MYSQL_DATABASE = "xlb_local"
$env:MYSQL_USER = "xlb"
$env:MYSQL_PASSWORD = "xlb_local_password"

Get-Command pnpm.cmd -ErrorAction Stop | Out-Null
Write-Host "Running local migrations through the canonical backend migration CLI..."

Push-Location $Root
try {
  & pnpm.cmd run db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "canonical migration CLI failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Write-Host "migrate-local: passed"
