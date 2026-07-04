$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*Export*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/019_worker_receivable_statement_export.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel|payment_instruction|notification') { throw "Phase 8H must not implement provider split, withdrawal, or notification sending." }
$UiChanges = @(git -C $Root diff --name-only 16793276ff6ddfa82341c10d2ed4c5f49d16746a -- apps/customer apps/worker apps/admin 2>$null | Where-Object { $_ -match '\.(tsx?|jsx?)$' -and $_ -notmatch 'node_modules' })
if ($UiChanges.Count -gt 0) { throw "Phase 8H modifies three-app UI: $($UiChanges -join ', ')" }
Write-Host "PASS: Phase 8H has no provider, withdrawal, notification, or UI scope."
