$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewRepository.ts")
if ($Service -notmatch 'assertCityScopedContext') { throw "Review service must be city scoped." }
if ($Repo -notmatch 'buildCityScopedWhere') { throw "Review repository must use city scoped queries." }
if ($Repo -notmatch 'city_code = \?') { throw "Review repository must filter by city_code." }
Write-Host "PASS: worker receivable statement reviews are city scoped."
