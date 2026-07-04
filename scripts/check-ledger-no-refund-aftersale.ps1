$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend/src/ledger") -Filter "*.ts"
$Matches = $Files | Select-String -Pattern 'refund|aftersale|reversal' -CaseSensitive:$false
if ($Matches) { $Matches | ForEach-Object { Write-Host $_ }; throw "Refund/aftersale/reversal boundary violation in ledger." }
Write-Host "PASS: ledger has no refund, aftersale, or reversal implementation."
