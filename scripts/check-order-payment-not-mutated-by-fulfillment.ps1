# Phase 7B gate: fulfillment lifecycle must not import or update order/payment modules.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend\src\fulfillment") -Filter "*.ts" -Recurse
$Hits = $Files | Select-String -Pattern 'UPDATE\s+(orders|payment_orders)|from\s+[''"].*\/(order|payment)\/|orderService|paymentOrderService'
if ($Hits) { Write-Host "check-order-payment-not-mutated-by-fulfillment FAILED:"; $Hits | ForEach-Object { Write-Host "  $($_.Path):$($_.LineNumber):$($_.Line.Trim())" }; exit 1 }
Write-Host "check-order-payment-not-mutated-by-fulfillment: passed"
