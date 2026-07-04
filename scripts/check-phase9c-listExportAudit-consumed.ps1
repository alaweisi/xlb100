$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementExportReviewPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'listExportAudit') { Write-Host "check-phase9c-listExportAudit-consumed: FAILED"; exit 1 }
Write-Host "check-phase9c-listExportAudit-consumed: passed"
