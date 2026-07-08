# Phase 8L gate: no UI file changes inside the reconciliation gap scan UI domain.
# Customer/worker UI changes are outside this historical Phase 8 settlement gate.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$allowedSettlementUi = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts",
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementExportReviewPage.tsx",
  "apps/admin/src/hashParams.ts",
  "apps/admin/src/pages/SettlementActionGovernancePage.tsx"
)
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - git diff"; exit 1 }
$violation = @()
foreach ($f in $changedFiles) {
  if ($allowedSettlementUi -contains $f) { continue }
  if ($f -match '^apps/admin/src/pages/Settlement' -or
      $f -eq 'apps/admin/src/app/App.tsx' -or
      $f -eq 'apps/admin/src/hashParams.ts' -or
      $f -eq 'apps/admin/vite.config.ts') { $violation += $f }
}
if ($violation.Count -gt 0) { Write-Host "FAILED - UI files changed"; $violation | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase8l-no-ui: passed (reconciliation gap scan UI domain only)"
