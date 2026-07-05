# Phase 12 gate: no execution keywords in Phase 12 changed/new files.
# Phase 12 is preparation-only; execution vocabulary must not appear.
$ErrorActionPreference = "Stop"

# ══════════════════════════════════════════════════════════════════
# unsafe_fixtures — self-test: verify gate rejects execution keywords
# ══════════════════════════════════════════════════════════════════
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "exec-keywords.ts"
  @'
const status = "approved_for_execution";
const ready = "execute_ready";
const payout = "payout_ready";
'@ | Out-File -FilePath $fixtureFile -Encoding UTF8

  $executionKeywords = @(
    'approved_for_execution','ready_for_execution','execution_approved',
    'ready_to_execute','execute_ready','payout_ready','payment_ready',
    'execute_payout','pay_now','commit_settlement',
    'generate_export','download_url','file_path','payout_batch_id',
    'approvedForExecution','readyForExecution','executionApproved',
    'readyToExecute','executeReady','payoutReady','paymentReady',
    'executePayout','payNow','commitSettlement',
    'generateExport','downloadUrl','filePath','payoutBatchId'
  )

  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw
  $lineNum = 0
  $lines = $content -split "`n"
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }
    foreach ($kw in $executionKeywords) {
      if ($trimmed -match "(?i)$kw") {
        $fixtureViolations += "$($fixtureFile):$lineNum`: $trimmed"
        break
      }
    }
  }

  if ($fixtureViolations.Count -eq 0) {
    Write-Host "check-phase12-no-execution-keywords: SELF-TEST FAILED - fixture should have triggered violation"
    exit 1
  }
  Write-Host "check-phase12-no-execution-keywords: self-test passed (fixture correctly rejected)"
} finally {
  Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
}

# ── Normal gate logic ─────────────────────────────────────────────
$Root = Split-Path -Parent $PSScriptRoot

$executionKeywords = @(
  'approved_for_execution',
  'ready_for_execution',
  'execution_approved',
  'ready_to_execute',
  'execute_ready',
  'payout_ready',
  'payment_ready',
  'execute_payout',
  'pay_now',
  'commit_settlement',
  'generate_export',
  'download_url',
  'file_path',
  'payout_batch_id',
  'approvedForExecution',
  'readyForExecution',
  'executionApproved',
  'readyToExecute',
  'executeReady',
  'payoutReady',
  'paymentReady',
  'executePayout',
  'payNow',
  'commitSettlement',
  'generateExport',
  'downloadUrl',
  'filePath',
  'payoutBatchId'
)

# Only allowed contexts: gate scripts themselves and boundary-doc markers
$allowedPatterns = @(
  'scripts/check-',
  'boundary-doc',
  'BOUNDARY_DOC'
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase12-no-execution-keywords: FAILED - git diff failed"
  exit 1
}

$violations = @()

foreach ($file in $changedFiles) {
  if ($file -notmatch '\.(ts|tsx|sql|md|ps1|json|html|css)$') { continue }

  $isAllowed = $false
  foreach ($ap in $allowedPatterns) {
    if ($file -match $ap) { $isAllowed = $true; break }
  }
  if ($isAllowed) { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }

  $content = Get-Content -Path $fullPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  if ($content -match 'boundary-doc|BOUNDARY_DOC') { continue }

  $lineNum = 0
  $lines = $content -split "`n"
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    foreach ($kw in $executionKeywords) {
      if ($trimmed -match "(?i)$kw") {
        $violations += "$($file):$lineNum`: $trimmed"
        break
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-no-execution-keywords: FAILED - execution keywords found outside allowed context"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-no-execution-keywords: passed"
