# Phase 7B gate: fulfillment lifecycle must not call ledger or settlement.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend\src\fulfillment") -Filter "*.ts" -Recurse
$Hits = $Files | Select-String -Pattern 'from\s+[''"].*(ledger|settlement)|ledgerService|settlementService|insertLedger|createSettlement'
if ($Hits) {
  Write-Host "check-fulfillment-complete-no-ledger FAILED:"
  $Hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber):$($_.Line.Trim())" }
  exit 1
}
Write-Host "check-fulfillment-complete-no-ledger: passed"
