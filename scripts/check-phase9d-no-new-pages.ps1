$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
$newPages = $diff | Select-String "apps/admin/src/pages/" | Where-Object { $_ -notmatch "SettlementOpsPage|SettlementStatementDetailPage|SettlementExportReviewPage" }
if ($newPages) { Write-Host "check-phase9d-no-new-pages: FAILED — $newPages"; exit 1 }
Write-Host "check-phase9d-no-new-pages: passed"
