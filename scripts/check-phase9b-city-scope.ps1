$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$files = @(Get-ChildItem (Join-Path $Root "apps/admin/src/pages") -Filter "*.tsx" | Where-Object { $_.Name -ne "SettlementOpsPage.tsx" })
foreach ($f in $files) {
  $c = Get-Content $f.FullName -Raw
  if ($c -notmatch 'cityCode|city_code') { Write-Host "check-phase9b-city-scope: FAILED — $($f.Name) missing city scope"; exit 1 }
}
Write-Host "check-phase9b-city-scope: passed"
