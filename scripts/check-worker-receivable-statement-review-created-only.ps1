$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
if ($State -notmatch 'canReviewWorkerReceivableStatement[\s\S]*created') { throw "Reviews must require created statement status." }
if ($Service -notmatch 'assertWorkerReceivableStatementReviewable') { throw "Review service must assert created-only input." }
if ($Service -notmatch 'statement.status') { throw "Review service must validate statement status." }
if ($Service -match 'UPDATE worker_receivable_statements[\s\S]*status') { throw "Review must not mutate statement status." }
Write-Host "PASS: worker receivable statement reviews accept created statements only."
