$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
$phase9bAllowed = @(
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts"
)
$violations = @()
foreach ($file in $diff) {
  if ($phase9bAllowed -contains $file) { continue }
  if ($file -match '^scripts/' -or $file -match '^tests/') { continue }
  if ($file -match '^apps/admin/') { continue }
  if ($file -notmatch '^\.') { $violations += $file }
}
if ($violations.Count -gt 0) { Write-Host "check-phase9b-admin-only-scope: FAILED — $($violations -join ', ')"; exit 1 }
Write-Host "check-phase9b-admin-only-scope: passed"
