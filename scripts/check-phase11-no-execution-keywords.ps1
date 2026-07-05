# Phase 11 gate: no execution keywords in Phase 11 new/modified files.
# Allowed only in boundary-doc, rejection-test, or disabled-UI context.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$executionKeywords = @(
  'execute_payout',
  'pay_now',
  'provider_withdrawal',
  'execute_refund',
  'reverse_ledger',
  'mutate_settlement',
  'commit_settlement',
  'generate_export',
  'download_url',
  'file_path',
  'payout_batch_id'
)

# Files where execution keywords are allowed (boundary docs, rejection tests, disabled UI)
$allowedFiles = @(
  'docs/contracts/CONTRACT_SETTLEMENT_ACTION_GOVERNANCE.md',
  'docs/architecture/',
  'docs/reports/',
  'tests/security/plannerNoExecution.test.ts'
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase11-no-execution-keywords: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
foreach ($file in $changedFiles) {
  $isAllowed = $false
  foreach ($af in $allowedFiles) {
    if ($file.StartsWith($af)) { $isAllowed = $true; break }
  }
  if ($isAllowed) { continue }

  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }
  if ($file -notmatch '\.(ts|tsx|sql|md|ps1)$') { continue }

  $lines = Get-Content -Path $fullPath
  $lineNum = 0
  foreach ($line in $lines) {
    $lineNum++
    $trimmed = $line.Trim()
    if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
    foreach ($kw in $executionKeywords) {
      if ($trimmed -match $kw) {
        $violations += "$($file):$lineNum`: $trimmed"
        break
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase11-no-execution-keywords: FAILED - execution keywords found outside allowed context"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase11-no-execution-keywords: passed (boundary-doc/rejection-test/disabled-UI context allowed)"
