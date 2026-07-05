# Phase 12 gate: preparation writes only to settlement_execution_preparation_* tables. Not to governance_* or dry_run_*.
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$preparationDir = Join-Path $Root "backend\src\preparation"
$allowedTablePattern = 'settlement_execution_preparation_'
$forbiddenTablePatterns = @('\bgovernance_','\bdry_run_','\bsettlement_batches\b','\bsettlement_items\b','\bsettlement_payables\b','\bsettlement_payable_queue\b','\bledger_entries\b','\bledger_accounts\b','\bledger_accruals\b','\bpayment_orders\b','\bpayment_transactions\b')
$violations = @()
if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-only-preparation-table-writes: passed (preparation directory not yet created)"
  exit 0
}
$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
foreach ($file in $tsFiles) {
  $lines = Get-Content -Path $file.FullName; $lineNum = 0
  foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
    if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      if ($trimmed -notmatch $allowedTablePattern) {
        $violations += "$($file.Name):$lineNum`: $trimmed"
      } else {
        # Check it doesn't also reference forbidden tables
        foreach ($fp in $forbiddenTablePatterns) {
          if ($trimmed -match $fp) {
            $violations += "$($file.Name):$lineNum`: references forbidden table: $trimmed"
            break
          }
        }
      }
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-only-preparation-table-writes: FAILED - forbidden table writes detected"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-only-preparation-table-writes: passed (only settlement_execution_preparation_* tables allowed)"
