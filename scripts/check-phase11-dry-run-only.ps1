# Phase 11 gate: planner writes only to settlement_execution_dry_run_* tables
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$plannerDir = Join-Path $Root "backend\src\planner"
$forbiddenWriteTargets = @('\bledger_entries\b','\bledger_accounts\b','\bledger_accruals\b','\bsettlement_batches\b','\bsettlement_items\b','\bsettlement_payables\b','\bsettlement_payable_queue\b','\bpayment_orders\b','\bpayment_transactions\b','\bwallet_transactions\b','\bwallet_balances\b','\bprovider_dispatches\b','\bprovider_payouts\b')
$allowedTablePattern = 'settlement_execution_dry_run_|settlement_action_governance_'
$violations = @()
if (Test-Path $plannerDir) {
  $tsFiles = Get-ChildItem -Path $plannerDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $lines = Get-Content -Path $file.FullName; $lineNum = 0
    foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
      if ($trimmed -match '\bINSERT\s+INTO\b' -and $trimmed -notmatch $allowedTablePattern) { $violations += "$($file.Name):$lineNum`: INSERT to non-allowed table: $trimmed" }
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase11-dry-run-only: FAILED - forbidden table writes detected"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase11-dry-run-only: passed (only settlement_execution_dry_run_* and settlement_action_governance_* tables allowed)"
