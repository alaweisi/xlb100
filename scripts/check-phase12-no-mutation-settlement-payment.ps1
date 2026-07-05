# Phase 12 gate: no INSERT/UPDATE/DELETE on settlement/payment/ledger tables in preparation/
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$preparationDir = Join-Path $Root "backend\src\preparation"
$forbiddenWriteTargets = @('\bsettlement_batches\b','\bsettlement_items\b','\bsettlement_payables\b','\bsettlement_payable_queue\b','\bpayment_orders\b','\bpayment_transactions\b','\bwallet_transactions\b','\bwallet_balances\b','\bledger_entries\b','\bledger_accounts\b','\bledger_accruals\b','\bprovider_dispatches\b','\bprovider_payouts\b','\brefund_orders\b','\breversal_entries\b')
$allowedTablePattern = 'settlement_execution_preparation_'
$violations = @()
if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-no-mutation-settlement-payment: passed (preparation directory not yet created)"
  exit 0
}
$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
foreach ($file in $tsFiles) {
  $lines = Get-Content -Path $file.FullName; $lineNum = 0
  foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
    if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b' -and $trimmed -notmatch $allowedTablePattern) {
      foreach ($fp in $forbiddenWriteTargets) {
        if ($trimmed -match $fp) { $violations += "$($file.Name):$lineNum`: $trimmed"; break }
      }
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-no-mutation-settlement-payment: FAILED - forbidden table mutation detected"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-mutation-settlement-payment: passed"
