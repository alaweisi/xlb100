$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase23d-performance-quality-closure"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 24B artifact: $Path" }
}

function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef HEAD -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 24B diff" }
  $untracked = @(& git ls-files --others --exclude-standard -- @Paths)
  return @($tracked + $untracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 23D baseline tag: $BaseRef" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-6]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-046 changed: $($locked -join ', ')" }
  Write-Host "PASS locked migrations 000-046 are unchanged"

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "047_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "047_phase24b_support_ticket_mvp.sql") {
    throw "Phase 24B must own exactly 047_phase24b_support_ticket_mvp.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  foreach ($required in @(
    "support_tickets", "support_ticket_events", "city_code <> '__global__'",
    "fk_support_ticket_order", "fk_support_ticket_complaint", "fk_support_ticket_worker_binding",
    "UNIQUE", "idempotency_key", "version"
  )) {
    if (-not $migration.Contains($required)) { throw "migration 047 missing required boundary: $required" }
  }
  if ($migration -match '(?im)^\s*(?:ALTER|DROP|RENAME|TRUNCATE)\s+') {
    throw "migration 047 must not alter/drop/rename/truncate locked objects"
  }

  $requiredArtifacts = @(
    "backend/src/support/supportModule.ts",
    "backend/src/support/ticket/supportTicketStateMachine.ts",
    "backend/src/support/ticket/supportTicketRepository.ts",
    "backend/src/support/ticket/supportTicketService.ts",
    "backend/src/support/ticket/supportTicketRoutes.ts",
    "packages/types/src/support.ts",
    "packages/validators/src/supportSchema.ts",
    "packages/api-client/src/support.ts",
    "docs/contracts/CONTRACT_SUPPORT_TICKETS.md",
    "tests/unit/supportTicketStateMachine.test.ts",
    "tests/contract/supportTicket.contract.test.ts",
    "tests/integration/phase24bSupportTicket.test.ts",
    "tests/security/phase24bBoundaries.test.ts",
    "tests/e2e/phase24b-support-ticket.spec.ts",
    "docs/reports/PHASE24B_SUPPORT_TICKET_MVP_REPORT.md",
    ".github/workflows/phase24b-support-ticket-gates.yml"
  )
  foreach ($artifact in $requiredArtifacts) { Require-Path $artifact }

  $supportFiles = @(Get-ChildItem (Join-Path $Root "backend/src/support") -Filter "*.ts" -File -Recurse)
  $violations = @()
  $forbiddenImports = '(?im)^\s*import\s+.*(?:orderRepository|payment.*Repository|dispatch.*Repository|worker.*Repository|aftersale.*Repository|ledger.*Repository|settlement.*Repository|refundRepository)'
  $forbiddenSql = '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:orders|payment_orders|dispatch_|worker_|aftersale_|ledger_|settlement_)'
  foreach ($file in $supportFiles) {
    $content = Get-Content $file.FullName -Raw
    $relative = $file.FullName.Substring($Root.Length + 1)
    if ($content -match $forbiddenImports) { $violations += "$relative imports a protected domain repository" }
    if ($content -match $forbiddenSql) { $violations += "$relative writes a protected domain table" }
  }
  if ($violations.Count -gt 0) { throw "Phase 24B domain boundary violations: $($violations -join '; ')" }
  $ticketRepository = Get-Content (Join-Path $Root "backend/src/support/ticket/supportTicketRepository.ts") -Raw
  if ($ticketRepository -match '(?im)\b(?:FROM|JOIN)\s+(?:orders|fulfillments|aftersale_|worker_)') {
    throw "SupportTicketRepository must access only support-owned tables"
  }
  $referenceReader = Get-Content (Join-Path $Root "backend/src/support/ticket/supportDomainReferenceReader.ts") -Raw
  if ($referenceReader -match '(?im)\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO|FOR\s+UPDATE)\b') {
    throw "Support domain reference reader must remain non-locking SELECT-only"
  }
  Write-Host "PASS Support owns only support tables and public domain links"

  $routes = Get-Content (Join-Path $Root "backend/src/support/ticket/supportTicketRoutes.ts") -Raw
  foreach ($required in @("createRequestContextMiddleware", "authorizeRequest", "/api/support/tickets", "/api/internal/support/tickets")) {
    if (-not $routes.Contains($required)) { throw "Support routes missing guard/route evidence: $required" }
  }
  $service = Get-Content (Join-Path $Root "backend/src/support/ticket/supportTicketService.ts") -Raw
  foreach ($required in @("assertCityScopedContext", "idempotency", "expectedVersion")) {
    if (-not $service.Contains($required)) { throw "Support service missing invariant evidence: $required" }
  }

  $deletedTests = @(& git diff --diff-filter=D --name-only $BaseRef HEAD -- tests)
  if ($deletedTests.Count -gt 0) { throw "Phase 24B deleted historical tests: $($deletedTests -join ', ')" }

  foreach ($testPath in $requiredArtifacts | Where-Object { $_ -like "tests/*" }) {
    $content = Get-Content (Join-Path $Root $testPath) -Raw
    if ($content -match '(?m)\b(?:it|test|describe)\.(?:skip|todo)\b') { throw "Phase 24B test is skipped/todo: $testPath" }
  }

  $package = Get-Content (Join-Path $Root "package.json") -Raw
  foreach ($script in @(
    "test:support:phase24b", "test:integration:phase24b", "test:security:phase24b",
    "test:migration:phase24b", "test:e2e:phase24b", "gate:phase24b"
  )) {
    if (-not $package.Contains("`"$script`"")) { throw "missing package script: $script" }
  }

  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase24b-support-ticket-gates.yml") -Raw
  if (-not $workflow.Contains("pnpm gate:phase24b")) { throw "Phase 24B workflow must run the hard-blocking gate" }
  if ($workflow -match 'continue-on-error') { throw "Phase 24B workflow must fail closed" }
} finally {
  Pop-Location
}

Write-Host "check-phase24b-boundaries: passed"
