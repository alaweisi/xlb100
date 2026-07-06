# Phase 14 production smoke scaffold.
# Reads production URLs from an env file or process env. It does not hardcode localhost.
param(
  [string]$EnvFile = ".env.production",
  [switch]$DryRun,
  [switch]$AllowLocalhost
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envPath = Join-Path $root $EnvFile

function Fail([string]$Message) {
  Write-Host "smoke-prod: FAILED - $Message"
  exit 1
}

function Read-EnvFile([string]$Path) {
  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    Fail "required env file not found: $EnvFile"
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim()
    }
  }
  return $values
}

$envValues = Read-EnvFile $envPath

function Get-ConfigValue([string]$Name) {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if ($processValue) {
    return $processValue
  }
  return $envValues[$Name]
}

$checks = @(
  @{ Name = "backend health"; Url = Get-ConfigValue "PROD_BACKEND_HEALTH_URL" },
  @{ Name = "backend db-health"; Url = Get-ConfigValue "PROD_BACKEND_DB_HEALTH_URL" },
  @{ Name = "customer"; Url = Get-ConfigValue "PROD_CUSTOMER_URL" },
  @{ Name = "worker"; Url = Get-ConfigValue "PROD_WORKER_URL" },
  @{ Name = "admin"; Url = Get-ConfigValue "PROD_ADMIN_URL" }
)

foreach ($check in $checks) {
  if (-not $check.Url) {
    Fail "missing URL for $($check.Name)"
  }

  try {
    $uri = [Uri]$check.Url
  } catch {
    Fail "invalid URL for $($check.Name): $($check.Url)"
  }

  if ($uri.Scheme -ne "https") {
    Fail "production URL must use https for $($check.Name): $($check.Url)"
  }

  if (-not $AllowLocalhost -and ($uri.Host -in @("localhost", "127.0.0.1", "::1"))) {
    Fail "production URL must not target localhost for $($check.Name): $($check.Url)"
  }
}

if ($DryRun) {
  foreach ($check in $checks) {
    Write-Host "smoke-prod: dry-run would check $($check.Name) -> $($check.Url)"
  }
  exit 0
}

foreach ($check in $checks) {
  Write-Host "smoke-prod: checking $($check.Name) -> $($check.Url)"
  try {
    $resp = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 15
    if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 400) {
      throw "status $($resp.StatusCode)"
    }
  } catch {
    Write-Host "smoke-prod: FAILED ($($check.Name)): $($_.Exception.Message)"
    exit 1
  }
}

Write-Host "smoke-prod: passed"
