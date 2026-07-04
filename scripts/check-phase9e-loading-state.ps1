$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'loading') { Write-Host "check-phase9e-loading-state: FAILED"; exit 1 }
Write-Host "check-phase9e-loading-state: passed"
