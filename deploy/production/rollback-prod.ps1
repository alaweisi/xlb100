# Phase 14 production rollback scaffold.
# Requires explicit confirmation and references the release rollback runbook.
param(
  [string]$EnvFile = ".env.production",
  [string]$ComposeFile = "deploy/compose/docker-compose.prod.yml",
  [string]$PreviousImageDigest = "",
  [string]$Confirmation = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

$requiredConfirmation = "ROLLBACK-PHASE14-PRODUCTION"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envPath = Join-Path $root $EnvFile
$composePath = Join-Path $root $ComposeFile
$runbookPath = Join-Path $root "docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md"

function Fail([string]$Message) {
  Write-Host "rollback-prod: FAILED - $Message"
  exit 1
}

if (-not (Test-Path -LiteralPath $runbookPath)) {
  Fail "rollback runbook not found: docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md"
}

if (-not (Test-Path -LiteralPath $envPath)) {
  Fail "required env file not found: $EnvFile"
}

if (-not (Test-Path -LiteralPath $composePath)) {
  Fail "compose file not found: $ComposeFile"
}

if ($EnvFile -like "*.example") {
  Fail "refusing to rollback with example env file: $EnvFile"
}

if ($Confirmation -ne $requiredConfirmation) {
  Fail "explicit confirmation required: -Confirmation $requiredConfirmation"
}

if (-not $PreviousImageDigest -or $PreviousImageDigest -notmatch '@sha256:[a-fA-F0-9]{64}$') {
  Fail "previous immutable image evidence is required: -PreviousImageDigest <registry/image@sha256:digest>"
}

Write-Host "rollback-prod: runbook: docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md"
Write-Host "rollback-prod: target previous immutable image evidence: $PreviousImageDigest"
Write-Host "rollback-prod: validating compose config"
& docker compose --env-file $envPath -f $composePath config | Out-Host
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose config failed"
}

if (-not $Apply) {
  Write-Host "rollback-prod: dry run only"
  Write-Host "rollback-prod: operator must update PROD_*_IMAGE values in $EnvFile to the approved previous images before applying"
  Write-Host "rollback-prod: would run: docker compose --env-file $EnvFile -f $ComposeFile up -d --no-build"
  exit 0
}

Write-Host "rollback-prod: pulling rollback image set"
& docker compose --env-file $envPath -f $composePath pull
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose rollback pull failed"
}

Write-Host "rollback-prod: applying rollback compose without local builds"
& docker compose --env-file $envPath -f $composePath up -d --no-build
if ($LASTEXITCODE -ne 0) {
  Fail "docker compose rollback up failed"
}

Write-Host "rollback-prod: completed; run production smoke and replay/immutability checks before declaring rollback successful"
