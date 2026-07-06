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

Write-Host "deploy-prod: validating compose config"
& docker compose --env-file $envPath -f $composePath config | Out-Host
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose config failed"
}

if (-not $Apply) {
  Write-Host "deploy-prod: dry run only"
  Write-Host "deploy-prod: would run: docker compose --env-file $EnvFile -f $ComposeFile up -d --build"
  Write-Host "deploy-prod: production remains NO-GO until PROD-OPS evidence and release owner approval are recorded"
  exit 0
}

Write-Host "deploy-prod: applying production compose"
& docker compose --env-file $envPath -f $composePath up -d --build
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose up failed"
}

Write-Host "deploy-prod: completed; attach smoke, replay/immutability, and owner approval evidence before any production PASS update"
