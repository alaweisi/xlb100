$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase23c-three-app-frontend-engineering"
$LockedRef = "xlb-phase23d-performance-quality-closure"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 23D artifact: $Path" }
}
function Require-Match([string]$Label, [string]$Content, [string]$Pattern) {
  if ($Content -notmatch $Pattern) { throw "$Label is missing required evidence: $Pattern" }
  Write-Host "PASS $Label"
}
function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef $PhaseTarget -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 23D diff" }
  $untracked = @()
  if ($PhaseTarget -eq "HEAD") {
    $untracked = @(& git ls-files --others --exclude-standard -- @Paths)
  }
  return @($tracked + $untracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 23C baseline tag: $BaseRef" }
  $lockedTag = @(& git tag --list $LockedRef)
  $PhaseTarget = if ($lockedTag -contains $LockedRef) { $LockedRef } else { "HEAD" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-5]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-045 changed: $($locked -join ', ')" }
  Write-Host "PASS locked migrations 000-045 are unchanged"

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "046_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "046_phase23d_query_path_indexes.sql") {
    throw "Phase 23D must own exactly 046_phase23d_query_path_indexes.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  foreach ($index in @("idx_payment_orders_city_order_status", "idx_payment_orders_city_order_created")) {
    Require-Match "migration index $index" $migration ([regex]::Escape($index))
  }

  $deletedTests = @(& git diff --diff-filter=D --name-only $BaseRef $PhaseTarget -- tests)
  if ($deletedTests.Count -gt 0) { throw "Phase 23D deleted historical tests: $($deletedTests -join ', ')" }

  $protected = @(Changed-Files @(
    "backend/src/order", "backend/src/payment", "backend/src/dispatch", "backend/src/worker",
    "backend/src/fulfillment", "backend/src/ledger", "backend/src/settlement", "backend/src/aftersale", "backend/src/providers",
    "apps", "packages/types", "packages/validators", "packages/api-client", "packages/config", "packages/ui"
  ) | Where-Object { $_ -match '\.(?:ts|tsx|js|mjs|cjs|json|sql)$' })
  if ($protected.Count -gt 0) { throw "Phase 23D changed protected application/business semantics: $($protected -join ', ')" }

  $backendRuntime = @(Changed-Files @("backend/src") | Where-Object { $_ -match '\.(?:ts|tsx|js|mjs|cjs)$' })
  $allowedRuntime = @("backend/src/app.ts", "backend/src/observability/metrics.ts")
  $unexpectedRuntime = @($backendRuntime | Where-Object { $allowedRuntime -notcontains $_ })
  if ($unexpectedRuntime.Count -gt 0) { throw "unexpected Phase 23D backend runtime files: $($unexpectedRuntime -join ', ')" }
  Write-Host "PASS application and protected business/provider semantics are unchanged"

  $required = @(
    "tests/unit/phase23dMetricsCardinality.test.ts",
    "tests/unit/phase23dWorkerJourneyComponents.test.tsx",
    "tests/integration/phase23dWorkerLifecycleE2E.test.ts",
    "tests/performance/phase23dMetricsPerformance.test.ts",
    "tests/performance/phase23dQueryPlanIndexes.test.ts",
    "tests/performance/phase23dLatencyConcurrencyGates.test.ts",
    ".github/workflows/phase23d-quality-gates.yml",
    "docs/reports/PHASE23D_PERFORMANCE_QUALITY_CLOSURE_REPORT.md"
  )
  foreach ($path in $required) { Require-Path $path }

  $metrics = Get-Content (Join-Path $Root "backend/src/observability/metrics.ts") -Raw
  $app = Get-Content (Join-Path $Root "backend/src/app.ts") -Raw
  foreach ($term in @("MAX_HTTP_METRIC_SERIES", "HTTP_METRIC_LABEL_NAMES", "__unmatched__", "__overflow__")) {
    Require-Match "bounded metrics $term" $metrics ([regex]::Escape($term))
  }
  Require-Match "status class bucketing" $metrics '(?is)(statusCode|status).{0,300}xx'
  Require-Match "route template caller" $app 'routeTemplate\s*:\s*request\.routeOptions\.url'
  if ($app -match '(?is)routeTemplate\s*:\s*request\.url') { throw "raw request.url must not become a metric label" }

  $latency = Get-Content (Join-Path $Root "tests/performance/phase23dLatencyConcurrencyGates.test.ts") -Raw
  Require-Match "p95 threshold" $latency '(?is)(p95|percentile\s*\(.+0\.95)'
  Require-Match "concurrent correctness" $latency 'Promise\.all'

  foreach ($path in $required | Where-Object { $_ -like "tests/*" }) {
    $content = Get-Content (Join-Path $Root $path) -Raw
    if ($content -match '(?m)\b(?:it|test|describe)\.(?:skip|todo)\b') { throw "Phase 23D test is skipped/todo: $path" }
  }

  $package = Get-Content (Join-Path $Root "package.json") -Raw
  foreach ($script in @(
    "test:boundary:phase23d", "test:worker:phase23d", "test:metrics:phase23d", "test:indexes:phase23d",
    "test:e2e:phase23d", "test:performance:phase23d", "test:migration:phase23d", "gate:phase23d"
  )) { Require-Match "package script $script" $package ([regex]::Escape("`"$script`"")) }

  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase23d-quality-gates.yml") -Raw
  Require-Match "hard-blocking Phase 23D workflow" $workflow 'pnpm gate:phase23d'
  if ($workflow -match 'continue-on-error') { throw "Phase 23D workflow must fail closed" }
} finally {
  Pop-Location
}

Write-Host "check-phase23d-boundaries: passed"
