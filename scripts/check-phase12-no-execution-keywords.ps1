$ErrorActionPreference = "Stop"
# unsafe_fixtures — self-test
$fixtureDir = Join-Path $env:TEMP "phase12-fixture-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
try {
  $fixtureFile = Join-Path $fixtureDir "bad-keywords.ts"
  "const status = 'approved_for_execution'; const exec = 'execute_ready'; const payout = 'payout_ready';" | Out-File -FilePath $fixtureFile -Encoding UTF8
  $executionKeywords = @('approved_for_execution','ready_for_execution','execution_approved','ready_to_execute','execute_ready','payout_ready','payment_ready','execute_payout','pay_now','commit_settlement','generate_export','download_url','file_path','payout_batch_id')
  $fixtureViolations = @()
  $content = Get-Content $fixtureFile -Raw
  foreach ($kw in $executionKeywords) { if ($content -match $kw) { $fixtureViolations += "$fixtureFile contains $kw" } }
  if ($fixtureViolations.Count -eq 0) { Write-Host "SELF-TEST FAILED"; exit 1 }
  Write-Host "check-phase12-no-execution-keywords: self-test passed (fixture correctly rejected)"
} finally { Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue }

# Normal gate logic
$Root = Split-Path -Parent $PSScriptRoot
$executionKeywords = @('approved_for_execution','ready_for_execution','execution_approved','ready_to_execute','execute_ready','payout_ready','payment_ready','execute_payout','pay_now','commit_settlement','generate_export','download_url','file_path','payout_batch_id')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$violations = @()
foreach ($file in $changedFiles) {
  if ($file -match 'docs/|tests/|scripts/') { continue }
  if ($file -notmatch '\.(ts|tsx|sql|ps1|md)$') { continue }
  $fullPath = Join-Path $Root $file; if (-not (Test-Path $fullPath)) { continue }
  $lines = Get-Content -Path $fullPath; $lineNum = 0
  foreach ($line in $lines) { $lineNum++; $trimmed = $line.Trim(); if ($trimmed -match '^\s*(//|#|/\*|\*| \*|--)') { continue }
    foreach ($kw in $executionKeywords) { if ($trimmed -match $kw) { $violations += "$($file):$lineNum`: $trimmed"; break } }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-no-execution-keywords: FAILED"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-execution-keywords: passed (docs/reports/tests/scripts allowed)"
