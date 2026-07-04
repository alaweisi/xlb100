$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Routes = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRoutes.ts")
if ($Repo -notmatch 'findBatchForConfirmation' -or $Repo -notmatch 'WHERE city_code = \? AND settlement_batch_id = \?') { throw "Confirmation batch lookup must be city scoped." }
if ($Repo -notmatch 'lockBatchItems' -or $Repo -notmatch 'WHERE city_code = \? AND settlement_batch_id = \?') { throw "Confirmation item lookup must be city scoped." }
if ($Routes -notmatch 'requireCityCode: true') { throw "Confirmation route must require city context." }
Write-Host "PASS: settlement confirmation is city scoped."
