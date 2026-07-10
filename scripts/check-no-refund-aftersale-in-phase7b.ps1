# Phase 7B gate: no refund, aftersale, or reversal wiring.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(
  # Phase 18 evidence is checked by check-phase18-boundaries.ps1.
  Get-ChildItem (Join-Path $Root "backend\src\fulfillment") -Filter "*.ts" -File
  Get-Item (Join-Path $Root "backend\src\events\fulfillmentEvents.ts")
)
$Hits = $Files | Select-String -Pattern "refund|aftersale|reversal"
if ($Hits) { Write-Host "check-no-refund-aftersale-in-phase7b FAILED:"; $Hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber):$($_.Line.Trim())" }; exit 1 }
Write-Host "check-no-refund-aftersale-in-phase7b: passed"
