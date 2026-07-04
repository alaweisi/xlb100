$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'initialCityCode') { Write-Host "check-phase9d-dashboard-city-persist: FAILED"; exit 1 }
Write-Host "check-phase9d-dashboard-city-persist: passed"
