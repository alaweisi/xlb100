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

$adminUrl = Get-ConfigValue "PROD_ADMIN_URL"
$checks = @(
  @{ Name = "backend health"; Kind = "health"; Url = Get-ConfigValue "PROD_BACKEND_HEALTH_URL" },
  @{ Name = "backend db-health"; Kind = "db-health"; Url = Get-ConfigValue "PROD_BACKEND_DB_HEALTH_URL" },
  @{ Name = "customer"; Kind = "frontend"; Url = Get-ConfigValue "PROD_CUSTOMER_URL" },
  @{ Name = "worker"; Kind = "frontend"; Url = Get-ConfigValue "PROD_WORKER_URL" },
  @{ Name = "admin"; Kind = "frontend"; Url = $adminUrl }
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

$oaUrl = [Uri]::new([Uri]$adminUrl, "/oa/").AbsoluteUri
$checks += @{ Name = "oa"; Kind = "oa"; Url = $oaUrl }

function Assert-OaAuthBoundary([string]$Origin) {
  $url = [Uri]::new([Uri]$Origin, "/api/oa/me").AbsoluteUri
  Write-Host "smoke-prod: checking OA authentication boundary -> $url"
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
    Fail "OA authentication boundary unexpectedly returned status $($response.StatusCode)"
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -ne 401) {
      Fail "OA authentication boundary must return 401; received $status"
    }
  }
}

if ($DryRun) {
  foreach ($check in $checks) {
    Write-Host "smoke-prod: dry-run would check $($check.Name) -> $($check.Url)"
  }
  Write-Host "smoke-prod: dry-run would assert /api/oa/me returns 401 without a token"
  exit 0
}

foreach ($check in $checks) {
  Write-Host "smoke-prod: checking $($check.Name) -> $($check.Url)"
  try {
    $resp = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 15
    if ($resp.StatusCode -ne 200) {
      throw "status $($resp.StatusCode)"
    }
    if ($check.Kind -eq "health") {
      $payload = $resp.Content | ConvertFrom-Json
      if ($payload.status -ne "ok" -or $payload.service -ne "xlb-backend") {
        throw "backend health payload is not ready"
      }
    } elseif ($check.Kind -eq "db-health") {
      $payload = $resp.Content | ConvertFrom-Json
      if (-not $payload.ok -or $payload.mysql -ne "ok" -or $payload.redis -ne "ok") {
        throw "database or Redis connectivity is not ready"
      }
      if (-not $payload.dataReliability.ready -or $payload.jobWorker.state -ne "fresh") {
        throw "data reliability or dedicated jobs heartbeat is not ready"
      }
    } else {
      if ($resp.Content.Length -lt 100 -or $resp.Content -notmatch '<(html|!doctype)') {
        throw "frontend response is not an application HTML document"
      }
      if ($check.Kind -eq "oa" -and $resp.Content -notmatch '<title>喜乐帮 · OA 运营中枢</title>') {
        throw "OA application marker is missing"
      }
    }
  } catch {
    Write-Host "smoke-prod: FAILED ($($check.Name)): $($_.Exception.Message)"
    exit 1
  }
}

Assert-OaAuthBoundary $adminUrl

Write-Host "smoke-prod: passed"
