$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/017_worker_receivable_statement.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel|payment_instruction') { throw "Phase 8F must not implement provider split or withdrawal." }
$UiChanges = @(git -C $Root diff --name-only 9a0e7ae05f67068e96fcc3e6cad3f85326078481 -- apps/customer apps/worker apps/admin 2>$null | Where-Object { $_ -match '\.(tsx?|jsx?)$' -and $_ -notmatch 'node_modules' })
if ($UiChanges.Count -gt 0) { throw "Phase 8F modifies three-app UI: $($UiChanges -join ', ')" }
Write-Host "PASS: Phase 8F has no provider, withdrawal, or UI scope."
