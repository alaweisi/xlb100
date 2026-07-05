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
      # Flag any write not targeting preparation tables at all
      if ($trimmed -notmatch $allowedTablePattern) {
        $alreadyFlagged = $false
        foreach ($fp in $forbiddenTablePatterns) {
          if ($trimmed -match $fp) { $alreadyFlagged = $true; break }
        }
        if (-not $alreadyFlagged) {
          $violations += "$($file):$lineNum`: non-preparation table write: $trimmed"
        }
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
