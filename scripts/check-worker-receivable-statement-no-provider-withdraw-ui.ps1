$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/017_worker_receivable_statement.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel|payment_instruction') {
  throw "Phase 8F must not implement provider split or withdrawal."
}

# Worker receivable statement gate applies to statement admin scope in this phase.
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
  git -C $Root diff --name-only 9a0e7ae05f67068e96fcc3e6cad3f85326078481 -- $UiScope 2>$null |
    Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' -and $_ -notmatch 'node_modules' }
)

$nonPhase9Ui = @($UiChanges | Where-Object {
  ($allowed -notcontains $_) -and ($_ -notlike "apps/customer/public/icons/*")
})

if ($nonPhase9Ui.Count -gt 0) {
  throw "UI: $($nonPhase9Ui -join ', ')"
}

Write-Host "PASS"
