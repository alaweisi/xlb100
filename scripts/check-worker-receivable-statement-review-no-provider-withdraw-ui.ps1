$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*Review*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/018_worker_receivable_statement_review.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)provider|withdraw|wechat|alipay|wallet|bank_account|payment_channel|payment_instruction') { throw "Phase 8G must not implement provider split or withdrawal." }
$UiChanges = @(git -C $Root diff --name-only 214da7c13c6e46d6b123000f9dce2b1bea96adc0 -- apps/customer apps/worker apps/admin 2>$null | Where-Object { $_ -match '\.(tsx?|jsx?)$' -and $_ -notmatch 'node_modules' })
if ($UiChanges.Count -gt 0) { throw "Phase 8G modifies three-app UI: $($UiChanges -join ', ')" }
Write-Host "PASS: Phase 8G has no provider, withdrawal, or UI scope."
