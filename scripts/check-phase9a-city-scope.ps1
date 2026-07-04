$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$pageFile = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
if (Test-Path $pageFile) {
  $content = Get-Content $pageFile -Raw
  if ($content -notmatch 'cityCode|city_code') { Write-Host "check-phase9a-city-scope: FAILED"; exit 1 }
}
Write-Host "check-phase9a-city-scope: passed"