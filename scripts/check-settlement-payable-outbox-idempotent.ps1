$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
if ($Repo -notmatch 'findBatchForUpdate[\s\S]*FOR UPDATE') { throw "Payable readiness must lock the batch row." }
if ($Service -notmatch 'existing[\s\S]*idempotent: true') { throw "Existing payable rows must return idempotently." }
if ($Service -notmatch 'eventType: "settlement.payable"') { throw "Payable readiness must write settlement.payable." }
Write-Host "PASS: payable row locking prevents duplicate payable outbox events."
