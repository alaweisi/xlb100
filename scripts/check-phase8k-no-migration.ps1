# Phase 8K gate: no migration 020 or 021 must exist (Phase 8K uses query-only approach)
# Phase 10 exemption: governance module creates tables 020-023
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$phase10Migrations = @("020_settlement_action_governance_intents.sql","021_settlement_action_governance_reviews.sql","022_settlement_action_governance_evidence_bundles.sql","023_settlement_action_governance_readiness_packets.sql")

$m020 = Get-ChildItem -Path $migrationsDir -Filter "020_*" -File -ErrorAction SilentlyContinue
$m021 = Get-ChildItem -Path $migrationsDir -Filter "021_*" -File -ErrorAction SilentlyContinue
$allFiles = @(); if ($m020) { $allFiles += $m020 }; if ($m021) { $allFiles += $m021 }

$violations = @()
foreach ($f in $allFiles) { if ($phase10Migrations -contains $f.Name) { continue }; $violations += $f }
if ($violations.Count -gt 0) { Write-Host "check-phase8k-no-migration: FAILED - unexpected migration files found"; $violations | ForEach-Object { Write-Host "  $($_.Name)" }; exit 1 }
Write-Host "check-phase8k-no-migration: passed (Phase 10 governance migrations allowed)"
