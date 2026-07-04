$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableQueueService.ts")
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
if ($State -notmatch 'canEnqueueSettlementPayable[\s\S]*payable') { throw "Queue must require payable status." }
if ($Service -notmatch 'assertSettlementPayableEnqueueable') { throw "Queue service must assert payable-only input." }
if ($Service -notmatch 'payable.status !== "payable"') { throw "Non-payable rows must not be enqueued." }
Write-Host "PASS: settlement payable queue accepts payable rows only."
