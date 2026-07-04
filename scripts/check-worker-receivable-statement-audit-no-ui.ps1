# Phase 8I gate: no UI file changes (allow api-client only)
# Phase 9A exemption: admin settlement ops console is a Phase 9A deliverable
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$phase9aAllowed = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts"
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx"
)

$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-worker-receivable-statement-audit-no-ui: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$uiViolations = @()
foreach ($file in $changedFiles) {
  if ($phase9aAllowed -contains $file) { continue }
  if ($file -match '^apps/customer/' -or
      $file -match '^apps/worker/' -or
      $file -match '^apps/admin/') {
    $uiViolations += $file
  }
}

if ($uiViolations.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-no-ui: FAILED - UI files changed"
  $uiViolations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-no-ui: passed (Phase 9A UI exempted)"
