$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10 governance page is a disabled governance shell (no API calls, no city scope needed)
$phase10GovernancePage = "SettlementActionGovernancePage.tsx"
$files = @(Get-ChildItem (Join-Path $Root "apps/admin/src/pages") -Filter "*.tsx" | Where-Object { $_.Name -ne "SettlementOpsPage.tsx" -and $_.Name -ne $phase10GovernancePage })
foreach ($f in $files) {
  $c = Get-Content $f.FullName -Raw
  if ($c -notmatch 'cityCode|city_code') { Write-Host "check-phase9b-city-scope: FAILED — $($f.Name) missing city scope"; exit 1 }
}
Write-Host "check-phase9b-city-scope: passed (Phase 10 governance page exempt — disabled shell, no API calls)"
