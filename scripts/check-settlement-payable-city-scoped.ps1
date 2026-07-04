$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Routes = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRoutes.ts")
if ($Repo -notmatch 'findBatchForUpdate[\s\S]*FOR UPDATE') { throw "Payable readiness must lock the batch row." }
if ($Repo -notmatch 'getPayableByBatch[\s\S]*buildCityScopedWhere') { throw "Payable reads must be city scoped." }
if ($Routes -notmatch 'mark-payable' -or $Routes -notmatch 'getPayableByBatch') { throw "Payable routes must be city scoped via request context." }
Write-Host "PASS: settlement payable readiness is city scoped."
