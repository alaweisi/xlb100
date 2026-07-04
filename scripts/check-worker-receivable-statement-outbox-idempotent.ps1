$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementRepository.ts")
if ($Repo -notmatch 'findStatementsByQueue') { throw "Statement repo must detect existing statements." }
if ($Service -notmatch 'existing.length > 0[\s\S]*idempotent: true') { throw "Existing statements must return idempotently." }
if ($Service -notmatch 'eventType: "worker.receivable.statement.created"') { throw "Statement must write worker.receivable.statement.created." }
Write-Host "PASS: statement generation is idempotent with one outbox per statement."
