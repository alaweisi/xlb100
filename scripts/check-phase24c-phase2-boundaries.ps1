$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "ff815f1"
$PhaseEndRef = "5bc0647"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 24C Phase 2 artifact: $Path" }
}

function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef $PhaseEndRef -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 24C Phase 2 diff" }
  return @($tracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing accepted Phase 24C Phase 1 baseline: $BaseRef" }
  & git rev-parse --verify "$PhaseEndRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing accepted Phase 24C Phase 2 endpoint: $PhaseEndRef" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-8]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-048 changed: $($locked -join ', ')" }

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "049_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "049_phase24c_support_routing_sla_policies.sql") {
    throw "Phase 24C Phase 2 must own exactly 049_phase24c_support_routing_sla_policies.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  foreach ($required in @("support_sla_policies", "policy_series_id", "revision", "supersedes_policy_id", "routing_language", "create_idempotency_key", "mutation_idempotency_key", "city_code <> '__global__'")) {
    if (-not $migration.Contains($required)) { throw "migration 049 missing required Phase 2 boundary: $required" }
  }
  foreach ($forbidden in @("sla_first_response_breached_at", "sla_resolution_breached_at", "sla_breached", "claimed", "support_conversations")) {
    if ($migration.Contains($forbidden)) { throw "migration 049 entered Phase 3+ scope: $forbidden" }
  }

  foreach ($artifact in @(
    "backend/src/support/routing/supportRoutingService.ts",
    "backend/src/support/routing/supportSlaPolicyRepository.ts",
    "backend/src/support/routing/supportSlaPolicyService.ts",
    "backend/src/support/routing/supportSlaPolicyRoutes.ts",
    "apps/admin/src/pages/SupportRoutingConfigPage.tsx",
    "tests/contract/phase24cRoutingSla.contract.test.ts",
    "tests/integration/phase24cRoutingSla.test.ts",
    "tests/unit/phase24cRoutingSlaAdminPage.test.tsx",
    "tests/security/phase24cPhase2Boundaries.test.ts",
    "scripts/run-phase24c-phase2-migration-gate.mjs",
    "scripts/run-phase24c-phase2-gates.mjs",
    ".github/workflows/phase24c-phase2-routing-sla-gates.yml"
  )) { Require-Path $artifact }

  foreach ($dictionary in @("db/dictionary/TABLES.md", "db/dictionary/CITY_CODE_COLUMNS.md")) {
    $content = Get-Content (Join-Path $Root $dictionary) -Raw
    if (-not $content.Contains("support_sla_policies")) { throw "$dictionary missing support_sla_policies registration" }
  }

  $runtime = @(Changed-Files @("backend/src/support", "apps/admin/src", "packages"))
  $futurePattern = '(?i)(/claim\b|sla[_A-Za-z]*breach|SKIP\s+LOCKED|support\.sla\.breached|WebSocket|knowledge.?base|CSAT|public.?pool|assigned.?to.?me)'
  foreach ($relative in $runtime) {
    $phaseContent = (& git show "$PhaseEndRef`:$relative" 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "unable to read Phase 2 endpoint content: $relative" }
    if ($phaseContent -match $futurePattern) {
      throw "Phase 24C Phase 2 runtime entered Phase 3+ scope: $relative"
    }
  }

  $supportFiles = @(Get-ChildItem (Join-Path $Root "backend/src/support") -Filter "*.ts" -File -Recurse)
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_|worker_|aftersale_|ledger_|settlement_)'
  foreach ($file in $supportFiles) {
    if ((Get-Content $file.FullName -Raw) -match $forbiddenSql) {
      throw "Support writes a protected-domain table: $($file.FullName.Substring($Root.Length + 1))"
    }
  }

  $routes = Get-Content (Join-Path $Root "backend/src/support/routing/supportSlaPolicyRoutes.ts") -Raw
  foreach ($required in @("createRequestContextMiddleware", "authorizeRequest", "/api/internal/support/sla-policies")) {
    if (-not $routes.Contains($required)) { throw "Phase 2 SLA routes missing guard/resource: $required" }
  }

  $ticketService = Get-Content (Join-Path $Root "backend/src/support/ticket/supportTicketService.ts") -Raw
  foreach ($required in @("preferredLanguage", "assignedSkillGroupId", "slaFirstResponseDueAt", "slaResolutionDueAt")) {
    if (-not $ticketService.Contains($required)) { throw "ticket creation missing Phase 2 snapshot: $required" }
  }

  $deletedTests = @(& git diff --diff-filter=D --name-only $BaseRef $PhaseEndRef -- tests)
  if ($deletedTests.Count -gt 0) { throw "Phase 24C Phase 2 deleted historical tests: $($deletedTests -join ', ')" }
  foreach ($testPath in @(
    "tests/contract/phase24cRoutingSla.contract.test.ts",
    "tests/integration/phase24cRoutingSla.test.ts",
    "tests/unit/phase24cRoutingSlaAdminPage.test.tsx",
    "tests/security/phase24cPhase2Boundaries.test.ts"
  )) {
    $content = Get-Content (Join-Path $Root $testPath) -Raw
    if ($content -match '(?m)\b(?:it|test|describe)\.(?:skip|todo)\b') { throw "Phase 2 test is skipped/todo: $testPath" }
  }

  $package = Get-Content (Join-Path $Root "package.json") -Raw
  foreach ($script in @("test:contract:phase24c2", "test:integration:phase24c2", "test:ui:phase24c2", "test:security:phase24c2", "test:migration:phase24c2", "gate:phase24c2")) {
    if (-not $package.Contains("`"$script`"")) { throw "missing package script: $script" }
  }
  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase24c-phase2-routing-sla-gates.yml") -Raw
  if (-not $workflow.Contains("pnpm gate:phase24c2") -or $workflow -match 'continue-on-error') {
    throw "Phase 24C Phase 2 workflow must run a fail-closed aggregate gate"
  }
} finally { Pop-Location }

Write-Host "check-phase24c-phase2-boundaries: passed"
