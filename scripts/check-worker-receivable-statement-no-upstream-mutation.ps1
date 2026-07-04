$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementRepository.ts")
if ($Service -match '(?i)UPDATE\s+orders|UPDATE\s+payment_orders|UPDATE\s+fulfillments|UPDATE\s+ledger_accruals') { throw "Statements must not mutate upstream tables." }
if ($Service -match '(?i)UPDATE\s+settlement_payables|UPDATE\s+settlement_batches|UPDATE\s+settlement_items|UPDATE\s+settlement_payable_queue') { throw "Statements must not mutate settlement snapshots." }
if ($Repo -match '(?i)UPDATE\s+settlement_') { throw "Statement repository must not mutate settlement snapshots." }
Write-Host "PASS: worker receivable statements do not mutate upstream or settlement state."
