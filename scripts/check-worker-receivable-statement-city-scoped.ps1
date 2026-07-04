$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementRepository.ts")
$Routes = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRoutes.ts")
if ($Repo -notmatch 'listStatementsByPayable[\s\S]*buildCityScopedWhere') { throw "Statement reads must be city scoped." }
if ($Repo -notmatch 'getStatementById[\s\S]*buildCityScopedWhere') { throw "Statement detail reads must be city scoped." }
if ($Routes -notmatch 'generate-worker-statements-once' -or $Routes -notmatch 'worker-statements') { throw "Statement routes must exist." }
Write-Host "PASS: worker receivable statements are city scoped."
