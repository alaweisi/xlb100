$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase24b-support-ticket-mvp"
$PhaseEndRef = "ff815f1"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 24C Phase 1 artifact: $Path" }
}

function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef $PhaseEndRef -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 24C Phase 1 diff" }
  return @($tracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 24B baseline tag: $BaseRef" }
  & git rev-parse --verify "$PhaseEndRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing accepted Phase 24C Phase 1 endpoint: $PhaseEndRef" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-7]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-047 changed: $($locked -join ', ')" }

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "048_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "048_phase24c_support_agents_skill_groups.sql") {
    throw "Phase 24C Phase 1 must own exactly 048_phase24c_support_agents_skill_groups.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  foreach ($required in @(
    "support_agents", "support_skill_groups", "support_agent_skill_groups",
    "fk_support_agent_admin_city_scope", "fk_support_agent_skill_group_agent",
    "fk_support_agent_skill_group_group", "city_code <> '__global__'", "expectedVersion"
  )) {
    if ($required -eq "expectedVersion") { continue }
    if (-not $migration.Contains($required)) { throw "migration 048 missing required Phase 1 boundary: $required" }
  }
  foreach ($forbidden in @("support_sla_policies", "sla_breached", "routing_language", "support_conversations")) {
    if ($migration.Contains($forbidden)) { throw "migration 048 entered future scope: $forbidden" }
  }

  foreach ($artifact in @(
    "backend/src/support/agentWorkbench/supportAgentRepository.ts",
    "backend/src/support/agentWorkbench/supportAgentService.ts",
    "backend/src/support/agentWorkbench/supportAgentRoutes.ts",
    "tests/contract/phase24cAgentSkill.contract.test.ts",
    "tests/integration/phase24cAgentSkillGroups.test.ts",
    "tests/security/phase24cPhase1Boundaries.test.ts",
    "scripts/run-phase24c-phase1-migration-gate.mjs",
    "scripts/run-phase24c-phase1-gates.mjs",
    ".github/workflows/phase24c-phase1-agent-skill-gates.yml"
  )) { Require-Path $artifact }

  foreach ($dictionary in @("db/dictionary/TABLES.md", "db/dictionary/CITY_CODE_COLUMNS.md")) {
    $content = Get-Content (Join-Path $Root $dictionary) -Raw
    foreach ($table in @("support_agents", "support_skill_groups", "support_agent_skill_groups")) {
      if (-not $content.Contains($table)) { throw "$dictionary missing Phase 24C table registration: $table" }
    }
  }

  $changedApps = @(Changed-Files @("apps"))
  if ($changedApps.Count -gt 0) { throw "Phase 24C Phase 1 must not change UI: $($changedApps -join ', ')" }

  $newRuntime = @(Changed-Files @("backend/src/support/agentWorkbench", "backend/src/support/ticket/supportTicketService.ts", "backend/src/support/ticket/supportDomainReferenceReader.ts"))
  $futurePattern = '(?i)(/claim\b|support_sla_policies|sla[_A-Za-z]*breach|routing_language|preferredLanguage|WebSocket|knowledge.?base|CSAT)'
  foreach ($relative in $newRuntime) {
    $phaseContent = (& git show "$PhaseEndRef`:$relative" 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) { throw "unable to read Phase 1 endpoint content: $relative" }
    if ($phaseContent -match $futurePattern) {
      throw "Phase 24C Phase 1 runtime entered future scope: $relative"
    }
  }

  $supportFiles = @(Get-ChildItem (Join-Path $Root "backend/src/support") -Filter "*.ts" -File -Recurse)
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_|worker_|aftersale_|ledger_|settlement_)'
  foreach ($file in $supportFiles) {
    if ((Get-Content $file.FullName -Raw) -match $forbiddenSql) {
      throw "Support writes a protected-domain table: $($file.FullName.Substring($Root.Length + 1))"
    }
  }

  $routes = Get-Content (Join-Path $Root "backend/src/support/agentWorkbench/supportAgentRoutes.ts") -Raw
  foreach ($required in @("createRequestContextMiddleware", "authorizeRequest", "/api/internal/support/agents", "/api/internal/support/skill-groups")) {
    if (-not $routes.Contains($required)) { throw "Phase 1 routes missing guard/resource: $required" }
  }
  if ($routes -match '(?i)/claim\b|sla') { throw "Phase 1 routes entered claim/SLA scope" }

  $deletedTests = @(& git diff --diff-filter=D --name-only $BaseRef $PhaseEndRef -- tests)
  if ($deletedTests.Count -gt 0) { throw "Phase 24C Phase 1 deleted historical tests: $($deletedTests -join ', ')" }
  foreach ($testPath in @(
    "tests/contract/phase24cAgentSkill.contract.test.ts",
    "tests/integration/phase24cAgentSkillGroups.test.ts",
    "tests/security/phase24cPhase1Boundaries.test.ts"
  )) {
    $content = Get-Content (Join-Path $Root $testPath) -Raw
    if ($content -match '(?m)\b(?:it|test|describe)\.(?:skip|todo)\b') { throw "Phase 1 test is skipped/todo: $testPath" }
  }

  $package = Get-Content (Join-Path $Root "package.json") -Raw
  foreach ($script in @("test:contract:phase24c1", "test:integration:phase24c1", "test:security:phase24c1", "test:migration:phase24c1", "gate:phase24c1")) {
    if (-not $package.Contains("`"$script`"")) { throw "missing package script: $script" }
  }
  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase24c-phase1-agent-skill-gates.yml") -Raw
  if (-not $workflow.Contains("pnpm gate:phase24c1") -or $workflow -match 'continue-on-error') {
    throw "Phase 24C Phase 1 workflow must run a fail-closed aggregate gate"
  }
} finally { Pop-Location }

Write-Host "check-phase24c-phase1-boundaries: passed"
