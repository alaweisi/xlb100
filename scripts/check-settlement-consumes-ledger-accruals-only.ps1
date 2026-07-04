$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPreparationService.ts")
if ($Repo -notmatch 'SELECT la\.\* FROM ledger_accruals la') { throw "Settlement source must be ledger_accruals." }
if ($Repo -match '(?i)SELECT[\s\S]{0,120}\bFROM\s+(orders|payment_orders|fulfillments|ledger_entries)\b') { throw "Settlement must not source preparation from upstream operational tables or ledger_entries." }
if ($Service -notmatch 'findUnpreparedAccruals') { throw "Preparation service must consume the accrual repository method." }
Write-Host "PASS: settlement preparation consumes ledger_accruals only."
