$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
$c = Get-Content $page -Raw
if ($c -match 'slice\(0,\s*10\)') { Write-Host "check-phase9e-no-slice-10: FAILED — slice(0,10) still present"; exit 1 }
Write-Host "check-phase9e-no-slice-10: passed"
