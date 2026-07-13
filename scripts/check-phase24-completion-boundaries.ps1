$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "Phase 24 completion is fail-closed; missing artifact: $Path" }
}

Push-Location $Root
try {
  if (Test-Path "db/migrations/024_*") { throw "migration 024 is a permanent historical gap" }
  $migration054 = @(Get-ChildItem "db/migrations" -File -Filter "054_*.sql")
  if ($migration054.Count -gt 0) {
    $currentState = Get-Content "docs/CURRENT_STATE.md" -Raw
    $authorizedPhase27aMigration =
      $migration054.Count -eq 1 -and
      $migration054[0].Name -eq "054_phase27a_platform_delivery_foundation.sql" -and
      $currentState.Contains("Phase27A Platform Delivery Foundation") -and
      ($currentState.Contains("RUNTIME ENTRY AUTHORIZED") -or
        $currentState.Contains("HUMAN ACCEPTED — NOT LOCKED"))
    if (-not $authorizedPhase27aMigration) {
      throw "Phase 24 completion cannot create an unauthorized migration 054"
    }
  }
  $migration055 = @(Get-ChildItem "db/migrations" -File -Filter "055_*.sql")
  if ($migration055.Count -gt 0) {
    $currentState = Get-Content "docs/CURRENT_STATE.md" -Raw
    $authorizedPhase27bMigration =
      $migration055.Count -eq 1 -and
      $migration055[0].Name -eq "055_phase27b_notification_projection_foundation.sql" -and
      ($currentState.Contains("Phase 27B | B1 IMPLEMENTED") -or
        $currentState.Contains("Phase 27B | B1 ACCEPTED") -or
        $currentState.Contains("Phase 27B | B2 IMPLEMENTED"))
    if (-not $authorizedPhase27bMigration) {
      throw "Phase 24 completion cannot accept an unauthorized migration 055"
    }
  }
  $phase24Closure = (& git rev-list -n 1 xlb-phase24-customer-support-closure).Trim()
  if (-not $phase24Closure) { throw "Phase 24 closure tag is required before separate Phase 25 entry" }
  & git merge-base --is-ancestor $phase24Closure main
  if ($LASTEXITCODE -ne 0) { throw "Phase 24 closure tag must remain reachable from main before Phase 25 work" }

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
