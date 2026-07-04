$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportRepository.ts")
if ($Service -notmatch 'assertCityScopedContext') { throw "Export service must be city scoped." }
if ($Repo -notmatch 'buildCityScopedWhere') { throw "Export repository must use city scoped queries." }
if ($Repo -notmatch 'city_code = \?') { throw "Export repository must filter by city_code." }
Write-Host "PASS: worker receivable statement exports are city scoped."
