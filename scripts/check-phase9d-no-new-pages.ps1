$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10 governance page is a legitimate Phase 10A admin addition
$newPages = $diff | Select-String "apps/admin/src/pages/" | Where-Object { $_ -notmatch 'SettlementOpsPage|SettlementStatementDetailPage|SettlementExportReviewPage|SettlementActionGovernancePage' }
if ($newPages) { Write-Host "check-phase9d-no-new-pages: FAILED — $newPages"; exit 1 }
Write-Host "check-phase9d-no-new-pages: passed (Phase 10 governance page allowed)"
