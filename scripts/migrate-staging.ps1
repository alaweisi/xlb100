[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot

$requiredEnvironment = @(
  "MYSQL_HOST",
  "MYSQL_PORT",
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD"
)

foreach ($name in $requiredEnvironment) {
  $value = [Environment]::GetEnvironmentVariable($name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$name is required; staging migrations never use example credentials or implicit database defaults"
  }
}

$weakPasswords = @(
  "change-me",
  "change-me-in-production",
  "changeme",
  "password",
  "xlb_local_password"
)
$normalizedPassword = $env:MYSQL_PASSWORD.Trim().ToLowerInvariant()
if ($normalizedPassword -in $weakPasswords) {
  throw "MYSQL_PASSWORD is an example or local-only value; inject the staging migration credential explicitly"
}

if ($env:MYSQL_PORT -notmatch '^\d{1,5}$' -or [int]$env:MYSQL_PORT -lt 1 -or [int]$env:MYSQL_PORT -gt 65535) {
  throw "MYSQL_PORT must be an integer between 1 and 65535"
}
if ($env:MYSQL_DATABASE -eq "xlb_local") {
  throw "MYSQL_DATABASE points to xlb_local; refuse to run the staging migration helper against the local database"
}

$nodeEnv = [Environment]::GetEnvironmentVariable("NODE_ENV", "Process")
if ([string]::IsNullOrWhiteSpace($nodeEnv)) {
  $env:NODE_ENV = "staging"
} elseif ($nodeEnv -ne "staging") {
  throw "NODE_ENV must be staging when migrate-staging.ps1 is used"
}

Get-Command pnpm.cmd -ErrorAction Stop | Out-Null
Write-Host "Running staging migrations through the canonical backend migration CLI..."
Write-Host "Target: $($env:MYSQL_HOST):$($env:MYSQL_PORT)/$($env:MYSQL_DATABASE) user=$($env:MYSQL_USER)"

Push-Location $Root
try {
  & pnpm.cmd run db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "canonical migration CLI failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Write-Host "migrate-staging: passed"
