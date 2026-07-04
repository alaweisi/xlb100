# Phase 8L gate: no migration 022 or 023 must exist (Phase 8L uses query-only approach)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "022_*" -File -ErrorAction SilentlyContinue
$migrationFiles += Get-ChildItem -Path $migrationsDir -Filter "023_*" -File -ErrorAction SilentlyContinue

if ($null -ne $migrationFiles -and $migrationFiles.Count -gt 0) {
  Write-Host "check-phase8l-no-migration: FAILED - unexpected migration files found"
  $migrationFiles | ForEach-Object { Write-Host "  $($_.Name)" }
  exit 1
}

Write-Host "check-phase8l-no-migration: passed"
