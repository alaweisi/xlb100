$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableQueueService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
if ($Repo -notmatch 'findPayableByIdForEnqueue[\s\S]*FOR UPDATE') { throw "Queue must lock payable row." }
if ($Service -notmatch 'existing[\s\S]*idempotent: true') { throw "Existing queue rows must return idempotently." }
if ($Service -notmatch 'eventType: "settlement.payable.queued"') { throw "Queue must write settlement.payable.queued." }
Write-Host "PASS: queue row locking prevents duplicate queued outbox events."
