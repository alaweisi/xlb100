$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider_trade_no|provider_account|withdraw|wechat|alipay|bank_card') { throw "Phase 8C contains provider or withdrawal scope." }

# Phase 9A exemption: admin settlement ops console files are allowed
$phase9aAllowed = @(
  "apps/admin/src/pages/SettlementOpsPage.tsx",
  "apps/admin/src/app/App.tsx",
  "apps/admin/vite.config.ts"
)
$UiChanges = @(git -C $Root diff --name-only bfea4e9651f477abf4a57d98b41c52d11e69f93d -- apps/customer apps/worker apps/admin)
$nonPhase9Ui = $UiChanges | Where-Object { $phase9aAllowed -notcontains $_ }
if ($nonPhase9Ui.Count -gt 0) { throw "Phase 8C modifies non-Phase9A three-app UI: $($nonPhase9Ui -join ', ')" }
Write-Host "PASS: Phase 8C has no provider, withdrawal, or non-Phase9A UI implementation."