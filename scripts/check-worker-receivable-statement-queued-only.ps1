$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
if ($State -notmatch 'canGenerateWorkerReceivableStatements[\s\S]*queued') { throw "Statements must require queued queue status." }
if ($Service -notmatch 'assertWorkerReceivableStatementGeneratable') { throw "Statement service must assert queued-only input." }
if ($Service -notmatch 'queue.status !== "queued"') { throw "Non-queued rows must not generate statements." }
if ($Service -notmatch 'settlement payable queue not found') { throw "Missing queue must not generate statements." }
Write-Host "PASS: worker receivable statements accept queued payables only."
