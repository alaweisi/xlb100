$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$smoke = Join-Path $root "deploy/production/smoke-prod.ps1"
$powershell = (Get-Command powershell -ErrorAction SilentlyContinue).Source

function Fail([string]$Message) {
  Write-Host "check-unit-b-smoke-dryrun: FAILED - $Message"
  exit 1
}

if (-not $powershell) { Fail "Windows PowerShell is required" }
if (-not (Test-Path -LiteralPath $smoke -PathType Leaf)) { Fail "production smoke script is missing" }

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "xlb-unit-b-smoke-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null

try {
  $token = "unit-b-secret-token-that-must-not-appear"
  $tokenPath = Join-Path $temporaryRoot "customer-token"
  [IO.File]::WriteAllText($tokenPath, $token)

  $envPath = Join-Path $temporaryRoot ".env.production"
  $envLines = @(
    "PROD_BACKEND_HEALTH_URL=https://api.unit-b.test/health",
    "PROD_BACKEND_DB_HEALTH_URL=https://api.unit-b.test/api/system/db-health",
    "PROD_CUSTOMER_URL=https://customer.unit-b.test/",
    "PROD_WORKER_URL=https://worker.unit-b.test/",
    "PROD_ADMIN_URL=https://admin.unit-b.test/",
    "PROD_SMOKE_CITY_CODE=hangzhou",
    "PROD_SMOKE_SKU_ID=unit-b-smoke-sku",
    "PROD_SMOKE_ORDER_ID=unit-b-smoke-order",
    "PROD_SMOKE_CUSTOMER_TOKEN_FILE=$tokenPath"
  )
  [IO.File]::WriteAllLines($envPath, $envLines)

  $output = & $powershell -NoProfile -ExecutionPolicy Bypass -File $smoke -EnvFile $envPath -DryRun 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "valid dry-run failed: $($output -join [Environment]::NewLine)" }
  $joined = $output -join [Environment]::NewLine
  foreach ($required in @(
    "customer same-origin API", "worker same-origin API", "admin same-origin API",
    "read catalog", "WebSocket ready/ping/pong"
  )) {
    if (-not $joined.Contains($required)) { Fail "dry-run evidence is missing: $required" }
  }
  if ($joined.Contains($token)) { Fail "dry-run leaked the customer bearer token" }

  $invalidPath = Join-Path $temporaryRoot ".env.invalid"
  [IO.File]::WriteAllLines($invalidPath, $envLines.Replace("unit-b.test", "example.invalid"))
  $invalidOutput = & $powershell -NoProfile -ExecutionPolicy Bypass -File $smoke -EnvFile $invalidPath -DryRun 2>&1
  if ($LASTEXITCODE -eq 0) { Fail "placeholder .invalid URLs were accepted" }
  if (($invalidOutput -join [Environment]::NewLine) -notmatch "non-routable placeholder") {
    Fail "placeholder failure did not explain the invalid production hostname"
  }

  Write-Host "check-unit-b-smoke-dryrun: passed"
} finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
