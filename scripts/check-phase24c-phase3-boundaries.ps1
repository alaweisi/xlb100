$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "5bc0647"
$PhaseEndRef = "4374597"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 24C Phase 3 artifact: $Path" }
}

function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef $PhaseEndRef -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 24C Phase 3 diff" }
  return @($tracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing accepted Phase 24C Phase 2 baseline: $BaseRef" }
  & git rev-parse --verify "$PhaseEndRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing accepted Phase 24C Phase 3 endpoint: $PhaseEndRef" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-3]|2[5-9]|3[0-9]|4[0-9]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-023 or 025-049 changed: $($locked -join ', ')" }
  if (Test-Path (Join-Path $Root "db/migrations/024_*")) { throw "migration 024 is a permanent historical gap and must remain unused" }

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "050_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "050_phase24c_support_sla_breach_workbench.sql") {
    throw "Phase 24C Phase 3 must own exactly 050_phase24c_support_sla_breach_workbench.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  foreach ($required in @("sla_first_response_breached_at", "sla_resolution_breached_at", "claimed", "sla_breached", "support_tickets")) {
    if (-not $migration.Contains($required)) { throw "migration 050 missing Phase 3 boundary: $required" }
  }

  foreach ($artifact in @(
    "backend/src/support/ticket/supportSlaBreachRepository.ts",
    "backend/src/support/ticket/supportSlaBreachService.ts",
    "apps/admin/src/pages/SupportTicketsPage.tsx",
    "tests/contract/phase24cSlaWorkbench.contract.test.ts",
    "tests/integration/phase24cSlaWorkbench.test.ts",
    "tests/unit/phase24cAgentWorkbenchPage.test.tsx",
    "tests/security/phase24cPhase3Boundaries.test.ts",
    "scripts/run-phase24c-phase3-migration-gate.mjs",
    "scripts/run-phase24c-phase3-gates.mjs",
    ".github/workflows/phase24c-phase3-sla-workbench-gates.yml"
  )) { Require-Path $artifact }

  $runtime = @(Changed-Files @("backend/src/support", "backend/src/jobs", "apps/admin/src", "packages"))
  $futurePattern = '(?i)(WebSocket|socket\.io|support_conversations|knowledge.?base|support.?bot|botService|\bCSAT\b|quality.?review)'
  foreach ($relative in $runtime) {
    $phaseContent = (& git show "$PhaseEndRef`:$relative" 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "unable to read Phase 3 endpoint content: $relative" }
    if ($phaseContent -match $futurePattern) {
      throw "Phase 24C Phase 3 runtime entered Phase 24D-24F scope: $relative"
    }
  }

  $supportFiles = @(Get-ChildItem (Join-Path $Root "backend/src/support") -Filter "*.ts" -File -Recurse)
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_|worker_|aftersale_|ledger_|settlement_)'
  foreach ($file in $supportFiles) {
    if ((Get-Content $file.FullName -Raw) -match $forbiddenSql) {
      throw "Support writes a protected-domain table: $($file.FullName.Substring($Root.Length + 1))"
    }
  }

  $routes = Get-Content (Join-Path $Root "backend/src/support/ticket/supportTicketRoutes.ts") -Raw
  foreach ($required in @("createRequestContextMiddleware", "authorizeRequest", "/api/internal/support/tickets", "/claim")) {
    if (-not $routes.Contains($required)) { throw "Phase 3 ticket routes missing guard/resource: $required" }
  }
  $job = Get-Content (Join-Path $Root "backend/src/jobs/autoRun.ts") -Raw
  if ($job -notmatch '(?i)support.*sla|sla.*support') { throw "existing auto-run lifecycle is not wired to the Support SLA run-once step" }

  $page = Get-Content (Join-Path $Root "apps/admin/src/pages/SupportTicketsPage.tsx") -Raw
  foreach ($required in @("Assigned to me", "Skill-group pool", "sla_due", "claimSupportTicket", "Overdue")) {
    if (-not $page.Contains($required)) { throw "Admin workbench missing Phase 3 behavior: $required" }
  }

  $deletedTests = @(& git diff --diff-filter=D --name-only $BaseRef $PhaseEndRef -- tests)
  if ($deletedTests.Count -gt 0) { throw "Phase 24C Phase 3 deleted historical tests: $($deletedTests -join ', ')" }
  foreach ($testPath in @(
    "tests/contract/phase24cSlaWorkbench.contract.test.ts",
    "tests/integration/phase24cSlaWorkbench.test.ts",
    "tests/unit/phase24cAgentWorkbenchPage.test.tsx",
    "tests/security/phase24cPhase3Boundaries.test.ts"
  )) {
    $content = Get-Content (Join-Path $Root $testPath) -Raw
    if ($content -match '(?m)\b(?:it|test|describe)\.(?:skip|todo)\b') { throw "Phase 3 test is skipped/todo: $testPath" }
  }

  $package = Get-Content (Join-Path $Root "package.json") -Raw
  foreach ($script in @("test:contract:phase24c3", "test:integration:phase24c3", "test:ui:phase24c3", "test:security:phase24c3", "test:migration:phase24c3", "gate:phase24c3")) {
    if (-not $package.Contains("`"$script`"")) { throw "missing package script: $script" }
  }
  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase24c-phase3-sla-workbench-gates.yml") -Raw
  if (-not $workflow.Contains("pnpm gate:phase24c3") -or $workflow -match 'continue-on-error') {
    throw "Phase 24C Phase 3 workflow must run a fail-closed aggregate gate"
  }
} finally { Pop-Location }

Write-Host "check-phase24c-phase3-boundaries: passed"
