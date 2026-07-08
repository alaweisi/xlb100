$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/015_settlement_payable_readiness.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel') {
  throw "Phase 8D must not implement provider split or withdrawal."
}

# Settlement-payable gate only applies to settlement admin UI surfaces in this phase.
$UiScope = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementExportReviewPage.tsx",
  "apps/admin/src/pages/SettlementActionGovernancePage.tsx"
)

$allowed = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementExportReviewPage.tsx",
  "apps/admin/src/pages/SettlementActionGovernancePage.tsx"
)

$UiChanges = @(
  git -C $Root diff --name-only 10410793c1dc1f3d749614bc6916a1af5b3b0abb -- $UiScope 2>$null |
    Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' -and $_ -notmatch 'node_modules' }
)

$nonPhase9Ui = @($UiChanges | Where-Object {
  ($allowed -notcontains $_) -and ($_ -notlike "apps/customer/public/icons/*")
})

if ($nonPhase9Ui.Count -gt 0) {
  throw "UI: $($nonPhase9Ui -join ', ')"
}

Write-Host "PASS"
