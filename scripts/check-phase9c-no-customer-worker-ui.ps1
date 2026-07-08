$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# Phase 9C historical gate: admin settlement export review UI scope only.
# Customer/worker UI changes are outside this locked Phase 9C admin settlement gate.
$allowedSettlementUi = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts",
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementExportReviewPage.tsx",
  "apps/admin/src/hashParams.ts",
  "apps/admin/src/pages/SettlementActionGovernancePage.tsx"
)

$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase9c-no-customer-worker-ui: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
foreach ($file in $diff) {
  if ($allowedSettlementUi -contains $file) { continue }
  if ($file -match '^apps/admin/src/pages/Settlement' -or
      $file -eq 'apps/admin/src/app/App.tsx' -or
      $file -eq 'apps/admin/src/hashParams.ts' -or
      $file -eq 'apps/admin/vite.config.ts') {
    $violations += $file
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase9c-no-customer-worker-ui: FAILED - settlement admin UI files changed"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9c-no-customer-worker-ui: passed (settlement admin UI domain only)"
