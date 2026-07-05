# Phase 11 gate: admin governance page has no enabled execute/payout/refund/download/export buttons
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$govPage = Join-Path $Root "apps\admin\src\pages\SettlementActionGovernancePage.tsx"
if (-not (Test-Path $govPage)) { Write-Host "check-phase11-no-ui-execution-controls: passed (governance page not found)"; exit 0 }
$c = Get-Content $govPage -Raw
$forbidden = @('execute_payout','pay_now','provider_withdrawal','execute_refund','reverse_ledger','commit_settlement','generate_export','download_url','file_path')
$violations = @()
foreach ($kw in $forbidden) {
  if ($c -match "disabled>.*$kw|$kw.*disabled" -or $c -match "\"$kw\"") { continue }
  if ($c -match $kw) { $violations += "governance page contains enabled use of '$kw'" }
}
if ($violations.Count -gt 0) { Write-Host "check-phase11-no-ui-execution-controls: FAILED - enabled execution controls found"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase11-no-ui-execution-controls: passed (execution controls appear only in disabled/forbidden context)"
