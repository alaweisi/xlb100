$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Routes = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRoutes.ts")
if ($Repo -notmatch 'findPayableByIdForEnqueue[\s\S]*FOR UPDATE') { throw "Queue must lock payable row." }
if ($Repo -notmatch 'getQueueByPayable[\s\S]*buildCityScopedWhere') { throw "Queue reads must be city scoped." }
if ($Routes -notmatch 'enqueue-once' -or $Routes -notmatch 'getQueueByPayable') { throw "Queue routes must be city scoped via request context." }
Write-Host "PASS: settlement payable queue is city scoped."
