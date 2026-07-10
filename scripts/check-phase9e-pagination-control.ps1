$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementOpsPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'nextCursor\s*&&' -or $c -notmatch 'fetchAll\(nextCursor\)') { Write-Host "check-phase9e-pagination-control: FAILED"; exit 1 }
Write-Host "check-phase9e-pagination-control: passed"
