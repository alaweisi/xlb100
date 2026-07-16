# Phase 14 production deploy scaffold.
# Safe by default: validates config and prints the deploy command unless -Apply is provided.
param(
  [string]$EnvFile = ".env.production",
  [string]$ComposeFile = "deploy/compose/docker-compose.prod.yml",
  [string]$Confirmation = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$requiredConfirmation = "DEPLOY-PHASE14-PRODUCTION"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envPath = Join-Path $root $EnvFile
$composePath = Join-Path $root $ComposeFile

function Fail([string]$Message) {
  Write-Host "deploy-prod: FAILED - $Message"
  exit 1
}

function Read-EnvValues([string]$Path) {
  $values = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) { $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'") }
  }
  return $values
}

if (-not (Test-Path -LiteralPath $envPath)) {
  Fail "required env file not found: $EnvFile"
}

if (-not (Test-Path -LiteralPath $composePath)) {
  Fail "compose file not found: $ComposeFile"
}

if ($EnvFile -like "*.example") {
  Fail "refusing to deploy with example env file: $EnvFile"
}

if ($Confirmation -ne $requiredConfirmation) {
  Fail "explicit confirmation required: -Confirmation $requiredConfirmation"
}

$envValues = Read-EnvValues $envPath
$imageNames = @("PROD_BACKEND_IMAGE", "PROD_CUSTOMER_IMAGE", "PROD_WORKER_IMAGE", "PROD_ADMIN_IMAGE")
foreach ($name in $imageNames) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if (-not $value) { $value = $envValues[$name] }
  if (-not $value -or $value -notmatch '@sha256:[a-fA-F0-9]{64}$') {
    Fail "$name must be an immutable sha256 registry digest"
  }
}

$secretFiles = @(
  "MYSQL_PASSWORD_SECRET_FILE", "MYSQL_TLS_CA_SECRET_FILE",
  "REDIS_PASSWORD_SECRET_FILE", "REDIS_TLS_CA_SECRET_FILE",
  "JWT_SECRET_FILE", "JWT_KEYS_JSON_SECRET_FILE",
  "AUTH_PHONE_HASH_SECRET_FILE", "AUTH_OTP_PEPPER_SECRET_FILE"
)
foreach ($name in $secretFiles) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if (-not $value) { $value = $envValues[$name] }
  if (-not $value -or -not (Test-Path -LiteralPath $value -PathType Leaf)) {
    Fail "$name must point to a readable secret-manager materialized file"
  }
}

Write-Host "deploy-prod: validating compose config"
& docker compose --env-file $envPath -f $composePath config | Out-Host
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose config failed"
}

if (-not $Apply) {
  Write-Host "deploy-prod: dry run only"
  Write-Host "deploy-prod: would pull immutable images, verify digests, then run compose up -d --no-build"
  Write-Host "deploy-prod: production remains NO-GO until PROD-OPS evidence and release owner approval are recorded"
  exit 0
}

Write-Host "deploy-prod: pulling immutable production images"
& docker compose --env-file $envPath -f $composePath pull
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose pull failed"
}

foreach ($name in $imageNames) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if (-not $value) { $value = $envValues[$name] }
  & docker image inspect $value --format '{{json .RepoDigests}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "pulled image digest could not be verified: $name" }
}

Write-Host "deploy-prod: applying production compose without local builds"
& docker compose --env-file $envPath -f $composePath up -d --no-build
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose up failed"
}

Write-Host "deploy-prod: completed; attach smoke, replay/immutability, and owner approval evidence before any production PASS update"
