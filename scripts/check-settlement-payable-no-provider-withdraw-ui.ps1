$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/015_settlement_payable_readiness.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel') { throw "Phase 8D must not implement provider split or withdrawal." }
$UiChanges = @(git -C $Root diff --name-only 10410793c1dc1f3d749614bc6916a1af5b3b0abb -- apps/customer apps/worker apps/admin 2>$null | Where-Object { $_ -match '\.(tsx?|jsx?)$' -and $_ -notmatch 'node_modules' })
if ($UiChanges.Count -gt 0) { throw "Phase 8D modifies three-app UI: $($UiChanges -join ', ')" }
Write-Host "PASS: Phase 8D has no provider, withdrawal, or UI scope."
