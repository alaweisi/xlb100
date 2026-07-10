$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$page = Join-Path $Root "apps/admin/src/pages/SettlementStatementDetailPage.tsx"
$c = Get-Content $page -Raw
if ($c -notmatch 'onNavigateToExports\(\{\s*statementId,\s*cityCode\s*\}\)') { Write-Host "check-phase9d-detail-exports-link: FAILED"; exit 1 }
Write-Host "check-phase9d-detail-exports-link: passed"
