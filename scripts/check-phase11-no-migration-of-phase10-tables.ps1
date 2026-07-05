# Phase 11 gate: migration 025 must not ALTER Phase 10/9/8 tables.
# Phase 11 planner tables are CREATE-only, no modification of prior phases.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$migrationFile = Get-ChildItem -Path $migrationsDir -Filter "025_*" -File -ErrorAction SilentlyContinue

# If migration 025 doesn't exist yet, gate passes
if (-not $migrationFile) {
  Write-Host "check-phase11-no-migration-of-phase10-tables: passed (migration 025 not created yet)"
  exit 0
}

$content = Get-Content $migrationFile.FullName -Raw

# Phase 10 table names (020-023)
$phase10Tables = @(
  'settlement_action_governance_intents',
  'settlement_action_governance_reviews',
  'settlement_action_governance_evidence_bundles',
  'settlement_action_governance_readiness_packets'
)

# Phase 9 tables (admin settlement ops)
$phase9Tables = @(
  'settlement_audit_summary',
  'worker_receivable_statement_review_summaries',
  'reconciliation_gap_scans'
)

# Phase 8 tables (settlement/ledger core)
$phase8Tables = @(
  'settlement_batches', 'settlement_items', 'settlement_payables', 'settlement_payable_queue',
  'worker_receivable_statements', 'worker_receivable_statement_lines',
  'worker_receivable_statement_reviews', 'worker_receivable_statement_exports',
  'ledger_entries', 'ledger_accounts', 'ledger_accruals'
)

$allProtected = $phase10Tables + $phase9Tables + $phase8Tables

$violations = @()
foreach ($table in $allProtected) {
  if ($content -match "ALTER\s+TABLE\s+`"?\w*${table}\w*`"?") {
    $violations += "ALTER TABLE $table found in migration 025"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-no-migration-of-phase10-tables: FAILED - ALTER on protected tables"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-no-migration-of-phase10-tables: passed"
