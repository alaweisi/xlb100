$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementExportReviewPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'filterStatementId') { Write-Host "check-phase9d-exports-filter: FAILED"; exit 1 }
Write-Host "check-phase9d-exports-filter: passed"
