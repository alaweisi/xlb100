$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider_trade_no|provider_account|withdraw|wechat|alipay|bank_card') { throw "Phase 8C contains provider or withdrawal scope." }
$UiChanges = @(git -C $Root diff --name-only bfea4e9651f477abf4a57d98b41c52d11e69f93d -- apps/customer apps/worker apps/admin)
if ($UiChanges.Count -gt 0) { throw "Phase 8C modifies three-app UI: $($UiChanges -join ', ')" }
Write-Host "PASS: Phase 8C has no provider, withdrawal, or UI implementation."
