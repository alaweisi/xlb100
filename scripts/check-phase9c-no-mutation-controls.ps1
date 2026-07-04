$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementExportReviewPage.tsx"
$c = Get-Content $page -Raw
if ($c -match '\b(approve|export-once|review-once|generate-once|fix|retry|repair|payout|paid|send)\b') { Write-Host "check-phase9c-no-mutation-controls: FAILED — $($matches[1])"; exit 1 }
Write-Host "check-phase9c-no-mutation-controls: passed"
