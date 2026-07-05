# Phase 12 gate: no execution keywords in Phase 12 changed/new files.
# Phase 12 is preparation-only; execution vocabulary must not appear outside
# docs/reports, tests, or boundary-doc context.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# Forbidden execution keywords (case-insensitive matching)
# Includes camelCase/snake_case variants
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
  # CamelCase variants (regex will catch via case-insensitive)
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

# Allowed contexts: docs/reports, test files, boundary-doc markers
$allowedPatterns = @("scripts/check-phase12-",
  '^docs/',
  '^docs\/reports/',
  '^tests/',
  '\.test\.ts$',
  '\.test\.tsx$',
  '\.spec\.ts$',
  '\.spec\.tsx$',
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
  # Only scan content files
  if ($file -notmatch '\.(ts|tsx|sql|md|ps1|json|html|css)$') { continue }

  # Check if this file is in an allowed context (docs/reports/tests/boundary-doc)
  $isAllowed = $false
  foreach ($ap in $allowedPatterns) {
    if ($file -match $ap) { $isAllowed = $true; break }
  }
  if ($isAllowed) { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }

  $content = Get-Content -Path $fullPath -Raw -ErrorAction SilentlyContinue
  if (-not $content) { continue }

  # Also check the file content for boundary-doc context markers
  if ($content -match 'boundary-doc|BOUNDARY_DOC') { continue }

  $lineNum = 0
  $lines = $content -split "`n"
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    # Skip comment lines
    if ($trimmed -match '^\s*(//|#|/\*|\*|\s*\*|--)') { continue }

    foreach ($kw in $executionKeywords) {
      # Case-insensitive match against the trimmed line
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

Write-Host "check-phase12-no-execution-keywords: passed (docs/reports/tests/boundary-doc context allowed)"
