$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase23b-event-api-reliability"
$LockedRef = "xlb-phase23c-three-app-frontend-engineering"

function Require-Path([string]$Path) {
  if (-not (Test-Path (Join-Path $Root $Path))) { throw "missing Phase 23C artifact: $Path" }
}
function Require-Match([string]$Label, [string]$Content, [string]$Pattern) {
  if ($Content -notmatch $Pattern) { throw "$Label is missing required evidence: $Pattern" }
  Write-Host "PASS $Label"
}
function Changed-Files([string[]]$Paths) {
  $tracked = @(& git diff --name-only $BaseRef $PhaseTarget -- @Paths)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect Phase 23C diff for: $($Paths -join ', ')" }
  $untracked = @()
  if ($PhaseTarget -eq "HEAD") {
    $untracked = @(& git ls-files --others --exclude-standard -- @Paths)
    if ($LASTEXITCODE -ne 0) { throw "unable to inspect untracked Phase 23C files" }
  }
  return @($tracked + $untracked | Sort-Object -Unique)
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 23B baseline tag: $BaseRef" }
  & git rev-parse --verify "$LockedRef^{commit}" *> $null
  $PhaseTarget = if ($LASTEXITCODE -eq 0) { $LockedRef } else { "HEAD" }

  $locked = @(Changed-Files @("db/migrations") | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-4]))_'
  })
  if ($locked.Count -gt 0) { throw "locked migrations 000-044 changed: $($locked -join ', ')" }
  Write-Host "PASS locked migrations 000-044 are unchanged"

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "045_*.sql")
  if ($migrationFiles.Count -ne 1 -or $migrationFiles[0].Name -ne "045_phase23c_frontend_engineering.sql") {
    throw "Phase 23C must own exactly 045_phase23c_frontend_engineering.sql"
  }
  $migration = Get-Content $migrationFiles[0].FullName -Raw
  Require-Match "045 marker" $migration "045_phase23c_frontend_engineering"
  Require-Match "045 schema_migrations insert" $migration '(?is)INSERT\s+INTO\s+schema_migrations'
  if ($migration -match '(?im)^\s*(CREATE|ALTER|DROP|TRUNCATE|UPDATE|DELETE)\b') {
    throw "Phase 23C marker migration must not contain schema or business-data mutations"
  }
  $nonMarkerInsert = [regex]::Matches($migration, '(?im)^\s*INSERT\s+INTO\s+([^\s(]+)') | Where-Object {
    $_.Groups[1].Value -ne 'schema_migrations'
  }
  if ($nonMarkerInsert.Count -gt 0) { throw "Phase 23C marker migration writes outside schema_migrations" }

  $protected = @(Changed-Files @(
    "backend/src", "packages/types", "packages/validators", "packages/api-client", "packages/config"
  ) | Where-Object { $_ -match '\.(?:ts|tsx|js|mjs|cjs|json|sql)$' })
  if ($protected.Count -gt 0) {
    throw "Phase 23C changed backend/contracts/API semantics: $($protected -join ', ')"
  }
  Write-Host "PASS backend, contract, API client, and provider semantics are unchanged"

  $boundaryPath = "packages/ui/src/components/AppErrorBoundary.tsx"
  Require-Path $boundaryPath
  $boundary = Get-Content (Join-Path $Root $boundaryPath) -Raw
  $uiIndex = Get-Content (Join-Path $Root "packages/ui/src/components/index.tsx") -Raw
  foreach ($term in @("getDerivedStateFromError", "componentDidCatch", "reset")) {
    Require-Match "AppErrorBoundary $term" $boundary ([regex]::Escape($term))
  }
  Require-Match "AppErrorBoundary UI export" $uiIndex 'AppErrorBoundary'

  foreach ($appName in @("customer", "worker", "admin")) {
    $main = Get-Content (Join-Path $Root "apps/$appName/src/main.tsx") -Raw
    $app = Get-Content (Join-Path $Root "apps/$appName/src/app/App.tsx") -Raw
    Require-Match "$appName shared ErrorBoundary" $main '(?is)from\s+["'']@xlb/ui["''].{0,1200}<AppErrorBoundary'
    Require-Match "$appName Suspense fallback" $main '(?is)<Suspense\s+fallback='
    Require-Match "$appName lazy boundary" ($main + "`n" + $app) '(?is)\blazy\s*\(.{0,500}\bimport\s*\('
  }

  $workerPages = @(Get-ChildItem (Join-Path $Root "apps/worker/src/pages") -File -Filter "*.tsx")
  if ($workerPages.Count -lt 4) { throw "Worker page split must contain at least four page modules" }
  foreach ($domain in @("auth", "tasks", "fulfillment", "finance")) {
    $domainPath = Join-Path $Root "apps/worker/src/features/$domain"
    if (-not (Test-Path $domainPath -PathType Container)) { throw "missing Worker feature domain: $domain" }
    $domainFiles = @(Get-ChildItem $domainPath -File | Where-Object { $_.Extension -in @(".ts", ".tsx") })
    if ($domainFiles.Count -eq 0) { throw "Worker feature domain has no TypeScript module: $domain" }
  }
  $workerApp = Get-Content (Join-Path $Root "apps/worker/src/app/App.tsx") -Raw
  Require-Match "Worker lazy page imports" $workerApp '(?is)\blazy\s*\(.{0,500}\bimport\s*\([^)]*pages/'

  $frontendSources = Get-ChildItem (Join-Path $Root "apps") -Recurse -File -Include *.ts,*.tsx |
    ForEach-Object { Get-Content $_.FullName -Raw }
  $frontendText = $frontendSources -join "`n"
  if ($frontendText -match '(?i)(restapi\.amap\.com|AlipaySDK|WeChatPay|OSSClient|S3Client)') {
    throw "Phase 23C must not add real payment, map, or object-storage provider integration"
  }

  foreach ($path in @(
    "tests/unit/appErrorBoundary.test.tsx",
    "tests/security/phase23cFrontendBoundaryGates.test.ts",
    ".github/workflows/phase23c-frontend-gates.yml",
    "docs/reports/PHASE23C_THREE_APP_FRONTEND_ENGINEERING_REPORT.md"
  )) { Require-Path $path }

  $workflow = Get-Content (Join-Path $Root ".github/workflows/phase23c-frontend-gates.yml") -Raw
  Require-Match "hard-blocking Phase 23C workflow" $workflow 'pnpm gate:phase23c'
  if ($workflow -match 'continue-on-error') { throw "Phase 23C workflow must fail closed" }
} finally {
  Pop-Location
}

Write-Host "check-phase23c-boundaries: passed"
