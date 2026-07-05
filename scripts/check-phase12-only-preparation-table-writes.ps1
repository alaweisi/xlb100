# Phase 12 gate: INSERT/UPDATE only on settlement_execution_preparation_* tables
# in ALL changed backend files. SELECT on any table is allowed.
# Catches SQL verbs split across lines (multiline).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$allowedTablePattern = 'settlement_execution_preparation_'
$forbiddenTablePatterns = @(
  '\bsettlement_batches\b',
  '\bsettlement_items\b',
  '\bsettlement_payables\b',
  '\bsettlement_payable_queue\b',
  '\bledger_entries\b',
  '\bledger_accounts\b',
  '\bledger_accruals\b',
  '\bpayment_orders\b',
  '\bpayment_transactions\b',
  '\bgovernance_',
  '\bdry_run_',
  '\bworker_receivable_statement',
  '\brefund_orders\b',
  '\breversal_entries\b',
  '\bprovider_payouts\b',
  '\bprovider_dispatches\b'
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-only-preparation-table-writes: FAILED - git diff failed"
  exit 1
}

$violations = @()

foreach ($file in $changedFiles) {
  # Only scan backend source files
  if ($file -notmatch '^backend/.*\.(ts|tsx|sql)$') { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }

  $content = Get-Content -Path $fullPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  # Strip comments for cleaner matching
  $stripped = $content -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
  # Collapse whitespace for multiline SQL detection
  $collapsed = $stripped -replace '\s+', ' '

  # Check for INSERT/UPDATE/DELETE statements
  if ($collapsed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
    # If it targets the allowed preparation table, it's OK
    if ($collapsed -notmatch $allowedTablePattern) {
      # Check if it hits any forbidden table
      $lineNum = 0
      $lines = $content -split "`n"
      foreach ($line in $lines) {
        $lineNum++
        $trimmed = $line.Trim()
        if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }
        if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
          foreach ($fp in $forbiddenTablePatterns) {
            if ($trimmed -match $fp) {
              $violations += "$($file):$lineNum`: $trimmed"
              break
            }
          }
          # Also flag writes not targeting preparation tables at all
          if ($trimmed -notmatch $allowedTablePattern) {
            $violations += "$($file):$lineNum`: non-preparation table write: $trimmed"
          }
        }
      }
    }
  }
}

# Also do multiline-aware scanning: read in 5-line windows
foreach ($file in $changedFiles) {
  if ($file -notmatch '^backend/.*\.(ts|tsx|sql)$') { continue }
  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }
  
  $lines = Get-Content -Path $fullPath -ErrorAction SilentlyContinue
  if (-not $lines) { continue }

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    # Detect SQL verb at start of a multi-line statement
    if ($trimmed -match '^\s*(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      # Collect next few lines to find the table reference
      $window = ''
      for ($j = $i; $j -lt [Math]::Min($i + 5, $lines.Count); $j++) {
        $wl = $lines[$j] -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
        $window += $wl + ' '
      }
      $windowCollapsed = $window -replace '\s+', ' '

      # If this window doesn't reference allowed table, flag it
      if ($windowCollapsed -notmatch $allowedTablePattern) {
        foreach ($fp in $forbiddenTablePatterns) {
          if ($windowCollapsed -match $fp) {
            $violations += "$($file):$($i+1)`: multiline SQL references forbidden table: $trimmed"
            break
          }
        }
      }
    }
  }
}

$violations = $violations | Select-Object -Unique

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-only-preparation-table-writes: FAILED - forbidden table writes detected"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-only-preparation-table-writes: passed (only settlement_execution_preparation_* table writes allowed)"
