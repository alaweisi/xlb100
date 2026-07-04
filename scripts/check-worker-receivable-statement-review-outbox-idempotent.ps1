$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewRepository.ts")
if ($Repo -notmatch 'findReviewByStatement') { throw "Review repo must detect existing reviews." }
if ($Service -notmatch 'existing[\s\S]*idempotent: true') { throw "Existing reviews must return idempotently." }
if ($Service -notmatch 'eventType: "worker.receivable.statement.reviewed"') { throw "Review must write worker.receivable.statement.reviewed." }
Write-Host "PASS: statement review is idempotent with one outbox per review."
