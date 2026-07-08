$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*Review*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/018_worker_receivable_statement_review.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"

if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel|payment_instruction') {
  throw "Phase 8G must not implement provider split or withdrawal."
}

# Worker receivable review gate applies to statement review admin scope in this phase.
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
  git -C $Root diff --name-only 214da7c13c6e46d6b123000f9dce2b1bea96adc0 -- $UiScope 2>$null |
    Where-Object { $_ -match '\.(tsx?|jsx?|ts|json|svg)$' -and $_ -notmatch 'node_modules' }
)

$nonPhase9Ui = @($UiChanges | Where-Object {
  ($allowed -notcontains $_) -and ($_ -notlike "apps/customer/public/icons/*")
})

if ($nonPhase9Ui.Count -gt 0) {
  throw "UI: $($nonPhase9Ui -join ', ')"
}

Write-Host "PASS"
