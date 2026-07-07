$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

if ($Text -match '(?i)provider_trade_no|provider_account|withdraw|wechat|alipay|bank_card') {
  throw "Phase 8C contains provider or withdrawal scope."
}

# Phase 10 governance page: disabled shell, execution disabled, no provider withdrawal.
# apiBase.ts is shared admin API base infrastructure introduced by Phase 14F same-origin hotfix.
# App.tsx is route shell entry; no provider-withdraw UI flow.
# workflowBindings.ts is adapter binding; no provider-withdraw UI flow.
$allowed = @(
  "apps/customer/src/app/App.tsx",
  "apps/worker/src/app/App.tsx",
  "apps/customer/src/adapters/workflowBindings.ts",
  "apps/worker/src/adapters/workflowBindings.ts",
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts",
  "apps/admin/src/pages/SettlementStatementDetailPage.tsx",
  "apps/admin/src/pages/SettlementExportReviewPage.tsx",
  "apps/admin/src/pages/SettlementActionGovernancePage.tsx",
  "apps/admin/src/hashParams.ts",
  "apps/admin/src/apiBase.ts",
  "apps/customer/capacitor.config.ts",
  "apps/customer/public/manifest.webmanifest"
)

$UiChanges = @(
  git -C $Root diff --name-only bfea4e9651f477abf4a57d98b41c52d11e69f93d -- apps/customer apps/worker apps/admin |
    Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' }
)

$nonPhase9Ui = @($UiChanges | Where-Object {
  ($allowed -notcontains $_) -and ($_ -notlike "apps/customer/public/icons/*")
})

if ($nonPhase9Ui.Count -gt 0) {
  throw "UI: $($nonPhase9Ui -join ', ')"
}

Write-Host "PASS"
