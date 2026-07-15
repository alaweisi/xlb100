[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot

function Require([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Read-Text([string]$RelativePath) {
  $path = Join-Path $Root $RelativePath
  Require (Test-Path -LiteralPath $path -PathType Leaf) "$RelativePath is missing"
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $path
}

$local = Read-Text "scripts/migrate-local.ps1"
$staging = Read-Text "scripts/migrate-staging.ps1"
$runbook = Read-Text "docs/release/STAGE2C2_MIGRATION_RUNBOOK.md"
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json

foreach ($scriptPath in @("scripts/migrate-local.ps1", "scripts/migrate-staging.ps1")) {
  $null = [ScriptBlock]::Create((Read-Text $scriptPath))
}

$canonical = "pnpm --filter @xlb/backend exec tsx src/dal/migrateCli.ts"
Require ($package.scripts.'db:migrate' -eq $canonical) "db:migrate must be the canonical backend migration CLI"
Require ($package.scripts.'db:migrate:local' -match 'migrate-local\.ps1') "db:migrate:local wrapper is missing"
Require ($package.scripts.'db:migrate:staging' -match 'migrate-staging\.ps1') "db:migrate:staging wrapper is missing"

foreach ($entry in @($local, $staging)) {
  $canonicalCalls = [regex]::Matches($entry, 'pnpm\.cmd run db:migrate')
  Require ($canonicalCalls.Count -eq 1) "migration wrapper must call db:migrate exactly once"
  Require ($entry -match '\$LASTEXITCODE\s+-ne\s+0') "migration wrapper must propagate canonical CLI failure"
  Require ($entry -notmatch '(?i)Get-ChildItem.+db\\migrations|docker(?:\.exe)?\s|mysql(?:\.exe)?\s|schema_migrations.+COUNT|source\s+\$?\{?containerPath|migrateCli\.ts') "wrapper bypasses db:migrate or reimplements migration discovery/SQL execution"
}

foreach ($name in @("MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD")) {
  Require ($staging -match [regex]::Escape("`"$name`"")) "staging wrapper must require $name"
}
Require ($staging -match 'change-me') "staging wrapper must explicitly reject example credentials"
Require ($staging -match 'xlb_local') "staging wrapper must reject the local database target"
Require ($staging -notmatch '\.env\.staging\.example') "staging wrapper must not load the example env file"

foreach ($term in @(
  "check-migration-integrity.ps1",
  "schema_migrations",
  "migration_execution_history",
  "checksum",
  "MIGRATION_LOCK_TIMEOUT",
  "MIGRATION_CHECKSUM_MISMATCH",
  "migration user",
  "single",
  "stop"
)) {
  Require ($runbook -match [regex]::Escape($term)) "migration runbook is missing required term: $term"
}

Write-Output "STAGE2C2_MIGRATION_RUNTIME PASS canonical_cli=backend/src/dal/migrateCli.ts wrappers=2"
