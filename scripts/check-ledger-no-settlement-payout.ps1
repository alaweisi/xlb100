$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend/src/ledger") -Filter "*.ts"
$Matches = $Files | Select-String -Pattern 'settlement|payout|withdrawal' -CaseSensitive:$false
if ($Matches) { $Matches | ForEach-Object { Write-Host $_ }; throw "Settlement/payout boundary violation in ledger." }
Write-Host "PASS: ledger has no settlement, payout, or withdrawal implementation."
