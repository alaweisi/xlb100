$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementExportReviewPage.tsx"
if (Test-Path $page) { Write-Host "check-phase9c-route-exists: passed" } else { Write-Host "check-phase9c-route-exists: FAILED — page not found"; exit 1 }
