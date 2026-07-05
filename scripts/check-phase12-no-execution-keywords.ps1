# Phase 12 gate: no execution keywords in Phase 12 new/modified files outside safe contexts
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$executionKeywords = @('execute_payout','pay_now','commit_settlement','approve_for_execution','provider_withdrawal','execute_refund','reverse_ledger','mutate_settlement','generate_export','download_url','file_path','payout_batch_id','execution_complete','finalize_settlement')
$allowedPatterns = @('^docs/','^scripts/check-','^tests/','^scripts/preflight-architecture.ps1')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - git diff"; exit 1 }
$violations = @()
foreach ($file in $changedFiles) {
  $isAllowed = $false; foreach ($ap in $allowedPatterns) { if ($file -match $ap) { $isAllowed = $true; break } }
  if ($isAllowed) { continue }
  $fullPath = Join-Path $Root $file
  if (-not (Test-Path $fullPath)) { continue }
  if ($file -notmatch '\.(ts|tsx|sql|md|ps1)$') { continue }
  $lines = Get-Content -Path $fullPath; $lineNum = 0
  foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }; foreach ($kw in $executionKeywords) { if ($trimmed -match $kw) { $violations += "$($file):$lineNum`: $trimmed"; break } } }
}
if ($violations.Count -gt 0) { Write-Host "FAILED - execution keywords found outside allowed context"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-execution-keywords: passed (docs/reports/tests context allowed)"
