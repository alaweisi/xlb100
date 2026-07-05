# Phase 12 gate: migration 026 must not ALTER Phase 8-11 tables.
# Phase 12 preparation tables are CREATE-only, no modification of prior phases.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migrationsDir = Join-Path $Root "db\migrations"
$migrationFile = Get-ChildItem -Path $migrationsDir -Filter "026_*" -File -ErrorAction SilentlyContinue

# If migration 026 doesn't exist yet, gate passes
if (-not $migrationFile) {
  Write-Host "check-phase12-no-alter-phase8-11-tables: passed (migration 026 not created yet)"
  exit 0
}

$content = Get-Content $migrationFile.FullName -Raw

# Phase 11 tables (025)
$phase11Tables = @(
  'settlement_execution_dry_run_plan',
  'settlement_execution_dry_run_plan_item',
  'settlement_execution_dry_run_audit'
)

# Phase 10 tables (020-023)
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

$allProtected = $phase11Tables + $phase10Tables + $phase9Tables + $phase8Tables

$violations = @()
foreach ($table in $allProtected) {
  if ($content -match "ALTER\s+TABLE\s+`"?\w*${table}\w*`"?") {
    $violations += "ALTER TABLE $table found in migration 026"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-alter-phase8-11-tables: FAILED - ALTER on protected tables"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-alter-phase8-11-tables: passed"
