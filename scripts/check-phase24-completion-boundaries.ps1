$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "Phase 24 completion is fail-closed; missing artifact: $Path" }
}

Push-Location $Root
try {
  if (Test-Path "db/migrations/024_*") { throw "migration 024 is a permanent historical gap" }
  if (Test-Path "db/migrations/054_*") { throw "Phase 24 completion cannot create a Phase 25/054 migration" }
  if ((Test-Path "docs/reports/PHASE25*") -or (Test-Path "docs/architecture/*phase25*")) { throw "Phase 25 must not be created before Phase 24 governance" }

  $expected = @{
    "051" = "051_phase24d_support_realtime_conversations.sql"
    "052" = "052_phase24e_support_bot_knowledge_base.sql"
    "053" = "053_phase24f_support_quality.sql"
  }
  foreach ($number in $expected.Keys) {
    $files = @(Get-ChildItem db/migrations -File -Filter "$number`_*.sql")
    if ($files.Count -ne 1 -or $files[0].Name -ne $expected[$number]) {
      throw "Phase 24 completion requires exactly $($expected[$number])"
    }
  }

  foreach ($path in @(
    "scripts/check-phase24c-phase3-boundaries.ps1",
    "scripts/check-phase24d-boundaries.ps1",
    "scripts/check-phase24e-boundaries.ps1",
    "scripts/check-phase24f-boundaries.ps1",
    "scripts/run-phase24c-phase3-gates.mjs",
    "scripts/run-phase24d-gates.mjs",
    "scripts/run-phase24e-gates.mjs",
    "scripts/run-phase24f-gates.mjs",
    "scripts/run-phase24d-migration-gate.mjs",
    "scripts/run-phase24e-migration-gate.mjs",
    "scripts/run-phase24f-migration-gate.mjs",
    "docs/contracts/CONTRACT_SUPPORT_TICKETS.md",
    "docs/contracts/CONTRACT_SUPPORT_ROUTING.md",
    "docs/contracts/CONTRACT_SUPPORT_REALTIME.md",
    "docs/contracts/CONTRACT_SUPPORT_BOT_KB.md",
    "docs/contracts/CONTRACT_SUPPORT_QUALITY.md"
  )) { Require-Path $path }

  $package = Get-Content package.json -Raw
  foreach ($script in @("gate:phase24c3","gate:phase24d","gate:phase24e","gate:phase24f",
    "test:migration:phase24d","test:migration:phase24e","test:migration:phase24f","gate:phase24")) {
    if (-not $package.Contains("`"$script`"")) { throw "Phase 24 completion is missing package script: $script" }
  }

  $supportModules = @("backend/src/support/ticket","backend/src/support/routing","backend/src/support/agentWorkbench",
    "backend/src/support/conversation","backend/src/support/bot","backend/src/support/knowledgeBase","backend/src/support/quality")
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_[a-z_]*|worker_[a-z_]*|aftersale_[a-z_]*|ledger_[a-z_]*|settlement_[a-z_]*)'
  foreach ($module in $supportModules) {
    if (-not (Test-Path $module)) { throw "missing Support completion module: $module" }
    foreach ($file in Get-ChildItem $module -File -Filter "*.ts" -Recurse) {
      if ((Get-Content $file.FullName -Raw) -match $forbiddenSql) { throw "Support writes a protected-domain table: $($file.FullName)" }
    }
  }

  $workflow = ".github/workflows/phase24-completion-gates.yml"
  Require-Path $workflow
  $workflowText = Get-Content $workflow -Raw
  if (-not $workflowText.Contains("pnpm gate:phase24") -or $workflowText -match "continue-on-error") {
    throw "Phase 24 completion CI must run the fail-closed aggregate gate"
  }
} finally { Pop-Location }

Write-Host "check-phase24-completion-boundaries: passed"
