# Phase 8J gate: no UI file changes inside the worker statement review summary UI domain.
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
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase8j-no-ui: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$uiViolations = @()
foreach ($file in $changedFiles) {
  if ($allowedSettlementUi -contains $file) { continue }
  if ($file -match '^apps/admin/src/pages/Settlement' -or
      $file -eq 'apps/admin/src/app/App.tsx' -or
      $file -eq 'apps/admin/src/hashParams.ts' -or
      $file -eq 'apps/admin/vite.config.ts') {
    $uiViolations += $file
  }
}

if ($uiViolations.Count -gt 0) {
  Write-Host "check-phase8j-no-ui: FAILED - UI files changed"
  $uiViolations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase8j-no-ui: passed (worker statement review summary UI domain only)"
