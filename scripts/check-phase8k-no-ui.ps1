# Phase 8K gate: no UI file changes
# Phase 10A exemption: admin settlement action governance page is a Phase 10A deliverable
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$allowedAdminUi = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx","apps/admin/src/app/App.tsx","apps/admin/vite.config.ts"
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx","apps/admin/src/pages/SettlementExportReviewPage.tsx"
  "apps/admin/src/hashParams.ts","apps/admin/src/pages/SettlementActionGovernancePage.tsx"
)
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - git diff"; exit 1 }
$violation = @()
foreach ($f in $changedFiles) {
  if ($allowedAdminUi -contains $f) { continue }
  if ($f -match '^apps/customer/' -or $f -match '^apps/worker/' -or $f -match '^apps/admin/') { $violation += $f }
}
if ($violation.Count -gt 0) { Write-Host "FAILED - UI files changed"; $violation | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase8k-no-ui: passed (Phase 10A UI allowed)"
