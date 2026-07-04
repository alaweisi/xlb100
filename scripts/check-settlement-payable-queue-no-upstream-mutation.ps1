$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableQueueService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
if ($Service -match '(?i)UPDATE\s+orders|UPDATE\s+payment_orders|UPDATE\s+fulfillments|UPDATE\s+ledger_accruals') { throw "Queue must not mutate upstream tables." }
if ($Service -match '(?i)UPDATE\s+settlement_payables|UPDATE\s+settlement_batches|UPDATE\s+settlement_items') { throw "Queue must not mutate settlement snapshots." }
Write-Host "PASS: settlement payable queue does not mutate upstream or settlement state."
