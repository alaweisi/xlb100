# Phase 8K gate: no forbidden terms in git diff
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$forbiddenPatterns = @('\bpayout\b','\bpaid_settlement\b','\bwithdraw\b','\brefund\b','\baftersale\b','\bnotification\b','\bpayment_instruction\b')
$allowedPathPattern = 'settlementActionIntent|governance|PHASE10|planner|preparation|025_settlement_execution_dry_run|governancePlanner|RC_INSPECTION|CONTRACT_SETTLEMENT'
$diff = & git -C $Root diff main...HEAD -- backend/src/ packages/ 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - git diff"; exit 1 }
$violations = @(); $lines = $diff -split "`n"; $currentFile = ""
foreach ($line in $lines) {
  if ($line -match '^diff --git') { $currentFile = ($line -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($line -match '^\+(?!\+)') {
    if ($currentFile -match $allowedPathPattern) { continue }
    $content = $line.Substring(1)
    foreach ($pattern in $forbiddenPatterns) { if ($content -match $pattern) { $violations += "$($currentFile): $($line.Trim())"; break } }
  }
}
if ($violations.Count -gt 0) { Write-Host "FAILED - forbidden terms"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase8k-forbidden-zone: passed (Phase 10+11+12 governance/planner/preparation allowed)"
