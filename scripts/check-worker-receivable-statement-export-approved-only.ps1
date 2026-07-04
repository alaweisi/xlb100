$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
if ($State -notmatch 'canExportWorkerReceivableStatement[\s\S]*approved') { throw "Exports must require approved review." }
if ($Service -notmatch 'assertWorkerReceivableStatementExportable') { throw "Export service must assert approved-only input." }
if ($Service -notmatch 'review.decision !== "approved"') { throw "Rejected reviews must not export." }
if ($Service -match 'UPDATE worker_receivable_statement_reviews') { throw "Export must not mutate review records." }
Write-Host "PASS: worker receivable statement exports accept approved reviews only."
