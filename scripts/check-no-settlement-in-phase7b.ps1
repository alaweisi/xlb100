# Phase 7B gate: no settlement, payout, or ledger wiring.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(
  Get-ChildItem (Join-Path $Root "backend\src\fulfillment") -Filter "*.ts" -Recurse
  Get-Item (Join-Path $Root "backend\src\events\fulfillmentEvents.ts")
)
$Hits = $Files | Select-String -Pattern "settlement|payout|ledger"
if ($Hits) { Write-Host "check-no-settlement-in-phase7b FAILED:"; $Hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber):$($_.Line.Trim())" }; exit 1 }
Write-Host "check-no-settlement-in-phase7b: passed"
