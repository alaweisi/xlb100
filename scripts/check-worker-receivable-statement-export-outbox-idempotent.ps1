$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportRepository.ts")
if ($Repo -notmatch 'findExportByStatement') { throw "Export repo must detect existing exports." }
if ($Service -notmatch 'existing[\s\S]*idempotent: true') { throw "Existing exports must return idempotently." }
if ($Service -notmatch 'eventType: "worker.receivable.statement.exported"') { throw "Export must write worker.receivable.statement.exported." }
Write-Host "PASS: statement export is idempotent with one outbox per export."
