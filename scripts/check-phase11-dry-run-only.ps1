# Phase 11 gate: planner writes only to settlement_execution_dry_run_* tables,
# not to ledger/settlement/payment/wallet/provider tables.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$plannerDir = Join-Path $Root "backend\src\planner"
$governanceDir = Join-Path $Root "backend\src\governance"

$forbiddenWriteTargets = @(
  '\bledger_entries\b',
  '\bledger_accounts\b',
  '\bledger_accruals\b',
  '\bsettlement_batches\b',
  '\bsettlement_items\b',
  '\bsettlement_payables\b',
  '\bsettlement_payable_queue\b',
  '\bpayment_orders\b',
  '\bpayment_transactions\b',
  '\bwallet_transactions\b',
  '\bwallet_balances\b',
  '\bprovider_dispatches\b',
  '\bprovider_payouts\b'
)

# Allowed table: only settlement_execution_dry_run_*
$allowedTablePattern = 'settlement_execution_dry_run_'

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

      # Look for write statements (INSERT/UPDATE/DELETE/CREATE TABLE)
      if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE)\b') {
        foreach ($pat in $forbiddenWriteTargets) {
          if ($trimmed -match $pat) {
            $violations += "$($file.Name):$lineNum`: writes to forbidden table: $trimmed"
            break
          }
        }
        # If it's a write but NOT to the allowed dry_run table, also flag
        if ($trimmed -match 'INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM' -and $trimmed -notmatch $allowedTablePattern) {
          # Only flag if we haven't already flagged it
          $alreadyFlagged = $false
          foreach ($v in $violations) { if ($v -match "$($file.Name):$lineNum`:") { $alreadyFlagged = $true; break } }
          if (-not $alreadyFlagged) {
            # Check it's not a SELECT query
            if ($trimmed -notmatch '^\s*SELECT\b') {
              $violations += "$($file.Name):$lineNum`: writes to non-dry_run table: $trimmed"
            }
          }
        }
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-dry-run-only: FAILED - forbidden table writes detected"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-dry-run-only: passed"
