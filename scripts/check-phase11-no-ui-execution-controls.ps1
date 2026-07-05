# Phase 11 gate: admin governance page has no enabled execution controls
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$govPage = Join-Path $Root "apps\admin\src\pages\SettlementActionGovernancePage.tsx"
if (-not (Test-Path $govPage)) { Write-Host "passed (page not found)"; exit 0 }
$c = Get-Content $govPage -Raw
if ($c -match '<button(?!\s+disabled)[^>]*>(Execute|Payout|Refund|Reverse|Commit|Download|Export|Withdraw)') { Write-Host "FAILED: enabled execution button found"; exit 1 }
Write-Host "check-phase11-no-ui-execution-controls: passed"
