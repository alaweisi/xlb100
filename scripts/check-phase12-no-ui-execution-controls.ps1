# Phase 12 gate: Phase 12 has no admin UI yet; pass trivially.
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$preparationUiPage = Join-Path $Root "apps\admin\src\pages\SettlementExecutionPreparationPage.tsx"
if (Test-Path $preparationUiPage) {
  $c = Get-Content $preparationUiPage -Raw
  if ($c -match '<button(?!\s+disabled)[^>]*>(Execute|Payout|Refund|Reverse|Commit|Download|Export|Withdraw|Prepare|Approve)') { Write-Host "FAILED: enabled execution button found in preparation UI"; exit 1 }
}
Write-Host "check-phase12-no-ui-execution-controls: passed (no admin UI for Phase 12)"
