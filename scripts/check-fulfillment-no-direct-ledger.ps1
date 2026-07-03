$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend/src/fulfillment") -Filter "*.ts"
$Matches = $Files | Select-String -Pattern 'from\s+["''].*ledger|import\s*\(.*ledger' -CaseSensitive:$false
if ($Matches) { $Matches | ForEach-Object { Write-Host $_ }; throw "Fulfillment must not call or import ledger directly." }
Write-Host "PASS: fulfillment has no direct ledger dependency."
