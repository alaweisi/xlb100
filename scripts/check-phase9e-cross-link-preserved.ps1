$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $Root "apps/admin/src/app/App.tsx"
$c = Get-Content $app -Raw
if ($c -notmatch 'navigateToDetail|navigateToExports') { Write-Host "check-phase9e-cross-link-preserved: FAILED"; exit 1 }
Write-Host "check-phase9e-cross-link-preserved: passed"
