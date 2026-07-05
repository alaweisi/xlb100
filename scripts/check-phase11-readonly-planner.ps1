# Phase 11 gate: planner only does SELECT (read) on non-planner tables,
# no INSERT/UPDATE/DELETE except on settlement_execution_dry_run_* tables.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$plannerDir = Join-Path $Root "backend\src\planner"
$governanceDir = Join-Path $Root "backend\src\governance"

$allowedOwnTables = @(
  'settlement_execution_dry_run_plan',
  'settlement_execution_dry_run_plan_item',
  'settlement_execution_dry_run_audit'
)

$allKnownTables = @(
  'ledger_entries', 'ledger_accounts', 'ledger_accruals',
  'settlement_batches', 'settlement_items', 'settlement_payables', 'settlement_payable_queue',
  'worker_receivable_statements', 'worker_receivable_statement_lines',
  'worker_receivable_statement_reviews', 'worker_receivable_statement_review_summaries',
  'worker_receivable_statement_exports',
  'payment_orders', 'payment_transactions',
  'orders', 'order_items',
  'dispatch_tasks', 'task_pool',
  'wallet_transactions', 'wallet_balances',
  'provider_dispatches', 'provider_payouts',
  'settlement_action_governance_intents', 'settlement_action_governance_reviews',
  'settlement_action_governance_evidence_bundles', 'settlement_action_governance_readiness_packets',
  'settlement_audit_summary', 'reconciliation_gap_scans',
  'workers', 'worker_certifications', 'worker_qualifications',
  'cities', 'city_configs', 'catalog', 'pricing_rules', 'event_outbox'
)

$violations = @()

foreach ($dir in @($plannerDir, $governanceDir)) {
  if (-not (Test-Path $dir)) { continue }
  $tsFiles = Get-ChildItem -Path $dir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $lines = Get-Content -Path $file.FullName
    $lineNum = 0
    foreach ($line in $lines) {
      $lineNum++
      $trimmed = $line.Trim()
      if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }

      # Check for INSERT/UPDATE/DELETE
      if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
        $isOwnTable = $false
        foreach ($ot in $allowedOwnTables) {
          if ($trimmed -match $ot) { $isOwnTable = $true; break }
        }
        if (-not $isOwnTable) {
          foreach ($kt in $allKnownTables) {
            if ($trimmed -match $kt) {
              $violations += "$($file.Name):$lineNum`: mutation on non-planner table ($kt): $trimmed"
              break
            }
          }
        }
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-readonly-planner: FAILED - non-SELECT operations on non-planner tables"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-readonly-planner: passed"
