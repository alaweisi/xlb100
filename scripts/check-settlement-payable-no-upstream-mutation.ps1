$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
if ($Service -match '(?i)UPDATE\s+orders|UPDATE\s+payment_orders|UPDATE\s+fulfillments|UPDATE\s+ledger_accruals') { throw "Payable readiness must not mutate upstream tables." }
if ($Repo -match '(?i)UPDATE\s+settlement_batches[\s\S]*markSettlementPayable|UPDATE\s+settlement_items[\s\S]*payable') { throw "Payable readiness must not mutate batch/item status." }
Write-Host "PASS: settlement payable readiness does not mutate upstream state."
