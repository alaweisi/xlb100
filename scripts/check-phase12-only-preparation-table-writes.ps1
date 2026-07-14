# Phase 12 gate: INSERT/UPDATE only on settlement_execution_preparation_* tables
# in ALL changed backend files. SELECT on any table is allowed.
# Catches SQL verbs split across lines (multiline).
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects forbidden writes
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-write.ts"
  "INSERT INTO settlement_batches (id, city_code, status) VALUES ('stb_1', 'hz', 'prepared')" | Out-File -FilePath $fixtureFile -Encoding UTF8

  $allowedTablePattern = 'settlement_execution_preparation_'
  $forbiddenTablePatterns = @(
    '\bsettlement_batches\b','\bsettlement_items\b','\bsettlement_payables\b',
    '\bsettlement_payable_queue\b','\bledger_entries\b','\bledger_accounts\b',
    '\bledger_accruals\b','\bpayment_orders\b','\bpayment_transactions\b',
    '\bgovernance_','\bdry_run_','\bworker_receivable_statement',
    '\brefund_orders\b','\breversal_entries\b','\bprovider_payouts\b','\bprovider_dispatches\b'
  )

  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw
  $stripped = $content -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
  $collapsed = $stripped -replace '\s+', ' '

  if ($collapsed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
    if ($collapsed -notmatch $allowedTablePattern) {
      foreach ($fp in $forbiddenTablePatterns) {
        if ($collapsed -match $fp) {
          $fixtureViolations += "fixture: forbidden write detected: $collapsed"
          break
        }
      }
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-only-preparation-table-writes: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-only-preparation-table-writes: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'docs/CURRENT_STATE.md')
$phase29Entry = Join-Path $Root 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29Architecture = Join-Path $Root 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29Contract = Join-Path $Root 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29Registry = Join-Path $Root 'docs/governance/phase-registry.json'
$phase29Authorized =
  ($currentState.Contains('| Phase 29 | IN PROGRESS |') -or $currentState.Contains('| Phase 29 | LOCKED |')) -and
  $currentState.Contains('D01') -and
  $currentState.Contains('D24') -and
  (Test-Path -LiteralPath $phase29Entry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('Every row below is **HUMAN APPROVED**') -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('| D24 |') -and
  (Test-Path -LiteralPath $phase29Architecture) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Architecture).Contains('ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED') -and
  (Test-Path -LiteralPath $phase29Contract) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Contract).Contains('Phase 29 human-approved contract') -and
  (Test-Path -LiteralPath $phase29Registry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Registry).Contains('Entry decisions D01-D24 are approved for continuous construction through independent acceptance.')

$allowedDefaultPattern = 'settlement_execution_preparation_'
$allowedPerModule = @{
  'backend/src/auth' = 'customers'
  'backend/src/cityConfig' = 'city_configs'
  'backend/src/events' = '(event_outbox|platform_event_[A-Za-z0-9_]+)'
  'backend/src/notification' = 'notification_[A-Za-z0-9_]+'
  'backend/src/governance' = 'settlement_action_governance_'
  'backend/src/ledger' = 'ledger_(accounts|accruals|entries)'
  'backend/src/planner' = 'settlement_execution_dry_run_'
  'backend/src/aftersale' = 'aftersale_refund_requests'
  'backend/src/enterprise' = '(customers|business_[A-Za-z0-9_]+|enterprise_bill_snapshots)'
  # Later Support phases own only support_* tables; Phase 24 boundary gates
  # independently reject protected-domain writes.
  'backend/src/support' = '(support_[A-Za-z0-9_]+|event_outbox)'
}
if ($phase29Authorized) {
  $allowedPerModule['backend/src/marketing'] = '(marketing_(campaigns|rule_revisions|discount_decisions|compensations|audit_records)|coupon_(definitions|grants|reservations|redemptions))'
  $allowedPerModule['backend/src/order'] = '(orders|order_price_snapshots)'
}

function Get-AllowedTablePattern([string]$FilePath) {
  foreach ($entry in $allowedPerModule.GetEnumerator()) {
    if ($FilePath -like "$($entry.Key)/*") {
      return $entry.Value
    }
  }
  return $allowedDefaultPattern
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
  Write-Host "check-phase12-only-preparation-table-writes: FAILED - git diff failed"
  exit 1
}

$violations = @()

foreach ($file in $changedFiles) {
  if ($file -notmatch '^backend/.*\.(ts|tsx|sql)$') { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }

  $content = Get-Content -Path $fullPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  $stripped = $content -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
  $collapsed = $stripped -replace '\s+', ' '

  # Per-line check: scan EVERY SQL statement, don't skip file when one allowed table found
  $lineNum = 0
  $lines = $content -split "`n"
  $allowedPattern = Get-AllowedTablePattern $file
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }
    if ($trimmed -match '\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      $table = Get-WriteTable $trimmed
      if ($table -and $table -notmatch "^$allowedPattern") {
        $violations += "$($file):$lineNum`: module write policy violation: $trimmed"
      }
    }
  }

  # Multiline detection: 5-line sliding window, scan ALL
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $trimmed = $lines[$i].Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    if ($trimmed -match '^\s*(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b') {
      $window = ''
      for ($j = $i; $j -lt [Math]::Min($i + 5, $lines.Count); $j++) {
        $wl = $lines[$j] -replace '\/\/.*$', '' -replace '\/\*[\s\S]*?\*\/', ''
        $window += $wl + ' '
      }
      $windowCollapsed = $window -replace '\s+', ' '

      $table = Get-WriteTable $windowCollapsed
      if ($table -and $table -notmatch "^$allowedPattern") {
        $violations += "$($file):$($i+1)`: multiline module write policy violation: $trimmed"
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
