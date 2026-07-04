# Phase 8K gate: no migration 020 or 021 must exist (Phase 8K uses query-only approach)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "020_*" -File -ErrorAction SilentlyContinue
$migrationFiles += Get-ChildItem -Path $migrationsDir -Filter "021_*" -File -ErrorAction SilentlyContinue

if ($null -ne $migrationFiles -and $migrationFiles.Count -gt 0) {
  Write-Host "check-phase8k-no-migration: FAILED - unexpected migration files found"
  $migrationFiles | ForEach-Object { Write-Host "  $($_.Name)" }
  exit 1
}

Write-Host "check-phase8k-no-migration: passed"
