# Phase 12 gate: no INSERT/UPDATE/DELETE on settlement/payment/ledger/refund/reversal/export
# tables in ALL changed backend files. Catches multiline SQL.
# Phase 12 is preparation-only — no money-movement table mutations.
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects ledger/refund mutations
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-mutation.ts"
  "INSERT INTO ledger_accruals (id, city_code, amount) VALUES ('la_1', 'hz', 100)" | Out-File -FilePath $fixtureFile -Encoding UTF8

  $forbiddenWriteTargets = @(
    '\bsettlement_batches\b','\bsettlement_items\b','\bsettlement_payables\b',
    '\bsettlement_payable_queue\b','\bpayment_orders\b','\bpayment_transactions\b',
    '\bwallet_transactions\b','\bwallet_balances\b','\bledger_entries\b',
    '\bledger_accounts\b','\bledger_accruals\b','\bprovider_dispatches\b',
    '\bprovider_payouts\b','\brefund_orders\b','\breversal_entries\b',
    '\bworker_receivable_statements\b','\bworker_receivable_statement_lines\b',
    '\bworker_receivable_statement_reviews\b','\bworker_receivable_statement_exports\b',
    '\bsettlement_action_governance_intents\b','\bsettlement_action_governance_reviews\b',
    '\bsettlement_action_governance_evidence_bundles\b','\bsettlement_action_governance_readiness_packets\b',
    '\bsettlement_execution_dry_run_plan\b','\bsettlement_execution_dry_run_plan_item\b',
    '\bsettlement_execution_dry_run_audit\b','\bsettlement_audit_summary\b',
    '\breconciliation_gap_scans\b'
  )
  $allowedTablePattern = 'settlement_execution_preparation_'

  $content = Get-Content $fixtureFile -Raw
  $stripped = $content -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
  $collapsed = $stripped -replace '\s+', ' '

  $fixtureViolations = @()
  if ($collapsed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
    if ($collapsed -notmatch $allowedTablePattern) {
      foreach ($fp in $forbiddenWriteTargets) {
        if ($collapsed -match $fp) {
          $fixtureViolations += "fixture: forbidden mutation: $collapsed"
          break
        }
      }
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenWriteTargets = @(
  '\bsettlement_batches\b',
  '\bsettlement_items\b',
  '\bsettlement_payables\b',
  '\bsettlement_payable_queue\b',
  '\bpayment_orders\b',
  '\bpayment_transactions\b',
  '\bwallet_transactions\b',
  '\bwallet_balances\b',
  '\bledger_entries\b',
  '\bledger_accounts\b',
  '\bledger_accruals\b',
  '\bprovider_dispatches\b',
  '\bprovider_payouts\b',
  '\brefund_orders\b',
  '\breversal_entries\b',
  '\bworker_receivable_statements\b',
  '\bworker_receivable_statement_lines\b',
  '\bworker_receivable_statement_reviews\b',
  '\bworker_receivable_statement_exports\b',
  '\bsettlement_action_governance_intents\b',
  '\bsettlement_action_governance_reviews\b',
  '\bsettlement_action_governance_evidence_bundles\b',
  '\bsettlement_action_governance_readiness_packets\b',
  '\bsettlement_execution_dry_run_plan\b',
  '\bsettlement_execution_dry_run_plan_item\b',
  '\bsettlement_execution_dry_run_audit\b',
  '\bsettlement_audit_summary\b',
  '\breconciliation_gap_scans\b'
)

$allowedTablePattern = 'settlement_execution_preparation_'

$allowedPerModule = @{
  'backend/src/governance' = 'settlement_action_governance_'
  'backend/src/ledger' = 'ledger_(accounts|accruals|entries)'
  'backend/src/planner' = 'settlement_execution_dry_run_'
}

function Get-AllowedTablePattern([string]$FilePath) {
  foreach ($entry in $allowedPerModule.GetEnumerator()) {
    if ($FilePath -like "$($entry.Key)/*") {
      return $entry.Value
    }
  }
  return $allowedTablePattern
}

function Get-WriteTable([string]$Sql) {
  if ($Sql -match '(?is)\bINSERT\s+INTO\s+[`"\[]?(?<table>[A-Za-z0-9_]+)') {
    return $Matches.table
  }
  if ($Sql -match '(?is)\bUPDATE\s+[`"\[]?(?<table>[A-Za-z0-9_]+)') {
    return $Matches.table
  }
  if ($Sql -match '(?is)\bDELETE\s+FROM\s+[`"\[]?(?<table>[A-Za-z0-9_]+)') {
    return $Matches.table
  }
  return $null
}

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export: FAILED - git diff failed"
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

  # Strip comments
  $stripped = $content -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
  $collapsed = $stripped -replace '\s+', ' '

  $allowedPattern = Get-AllowedTablePattern $file

  # First pass: per-line check
  $lineNum = 0
  $lines = $content -split "`n"
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      $targetTable = Get-WriteTable $trimmed
      if ($targetTable -and ($targetTable -notmatch "^$allowedPattern")) {
        foreach ($fp in $forbiddenWriteTargets) {
          if ($trimmed -match $fp) {
            $violations += "$($file):$lineNum`: $trimmed"
            break
          }
        }
      }
    }
  }

  # Multiline detection pass (5-line sliding windows)
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      $window = ''
      for ($j = $i; $j -lt [Math]::Min($i + 5, $lines.Count); $j++) {
        $wl = $lines[$j] -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
        $window += $wl + ' '
      }
      $windowCollapsed = $window -replace '\s+', ' '
      $targetTable = Get-WriteTable $windowCollapsed
      if ($targetTable -and ($targetTable -notmatch "^$allowedPattern")) {
        foreach ($fp in $forbiddenWriteTargets) {
          if ($windowCollapsed -match $fp) {
            $violations += "$($file):$($i+1)`: multiline SQL mutation: $trimmed"
            break
          }
        }
      }
    }
  }
}

$violations = $violations | Select-Object -Unique

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export: FAILED - forbidden table mutation detected"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-mutation-settlement-payment-ledger-refund-reversal-export: passed"
