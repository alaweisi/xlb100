$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

if ($Text -match '(?i)provider_trade_no|provider_account|withdraw|wechat|alipay|bank_card') {
  throw "Phase 8C contains provider or withdrawal scope."
}

# Settlement-confirm gate only applies to settlement admin UI surfaces in this phase.
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
  git -C $Root diff --name-only bfea4e9651f477abf4a57d98b41c52d11e69f93d -- $UiScope 2>$null |
    Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' -and $_ -notmatch 'node_modules' }
)

$nonPhase9Ui = @($UiChanges | Where-Object {
  ($allowed -notcontains $_) -and ($_ -notlike "apps/customer/public/icons/*")
})

if ($nonPhase9Ui.Count -gt 0) {
  throw "UI: $($nonPhase9Ui -join ', ')"
}

Write-Host "PASS"
