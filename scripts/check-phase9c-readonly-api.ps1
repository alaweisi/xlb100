$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementExportReviewPage.tsx"
$c = Get-Content $page -Raw
if ($c -match '\b(POST|PUT|PATCH|DELETE|post|put|patch|delete)\b') { Write-Host "check-phase9c-readonly-api: FAILED"; exit 1 }
Write-Host "check-phase9c-readonly-api: passed"
