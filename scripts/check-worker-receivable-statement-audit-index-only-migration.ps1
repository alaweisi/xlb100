# Phase 8I gate: migration 020 (if exists) must be CREATE INDEX only
# Since Phase 8I uses a query-only approach, no migration is expected
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$migrationFile = Get-ChildItem -Path $migrationsDir -Filter "020_*" -File -ErrorAction SilentlyContinue

if ($null -eq $migrationFile -or $migrationFile.Count -eq 0) {
  # No migration 020 - this is expected, pass trivially
  Write-Host "check-worker-receivable-statement-audit-index-only-migration: passed (no migration 020 file found - Phase 8I is query-only)"
  exit 0
}

# If migration exists, verify it only contains CREATE INDEX statements
$content = Get-Content -Path $migrationFile.FullName -Raw
$lines = $content -split "`n"

$violations = @()
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  $trimmed = $line.Trim()
  # Skip empty lines, comments, and CREATE INDEX statements
  if ([string]::IsNullOrWhiteSpace($trimmed)) { continue }
  if ($trimmed -match '^\s*--') { continue }
  if ($trimmed -match '^\s*/\*') { continue }
  if ($trimmed -match '^\s*\*') { continue }
  if ($trimmed -match '^\s*CREATE\s+(UNIQUE\s+)?INDEX\b') { continue }

  $violations += "line $lineNum`: $trimmed"
}

if ($violations.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-index-only-migration: FAILED - migration 020 contains non-INDEX statements"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-index-only-migration: passed"
