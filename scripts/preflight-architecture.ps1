# XLB architecture preflight (Phase 0 + Phase 1)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$requiredFiles = @(
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
  "README.md",
  "AGENTS.md",
  "backend/src/server.ts",
  "backend/src/app.ts",
  "backend/src/context/traceId.ts",
  "backend/src/context/requestContext.ts",
  "backend/src/context/requestContextMiddleware.ts",
  "backend/src/city/cityCanonicalizer.ts",
  "backend/src/city/cityResolver.ts",
  "backend/src/city/cityRouter.ts",
  "backend/src/city/cityScopeResolver.ts",
  "backend/src/gateway/appTypeGuard.ts",
  "backend/src/gateway/authz.ts",
  "backend/src/dal/scopedExecutor.ts",
  "backend/src/dal/adminQueryGuard.ts",
  "backend/src/dal/db.ts",
  "backend/src/dal/mysqlPool.ts",
  "backend/src/dal/repositoryBase.ts",
  "backend/src/dal/migrationRunner.ts",
  "backend/src/dal/seedRunner.ts",
  "backend/src/observability/health.ts",
  "db/migrations/001_city_foundation.sql",
  "db/migrations/002_dal_scope_foundation.sql",
  "db/seed/001_cities.seed.sql",
  "scripts/migrate-local.ps1",
  "scripts/seed-local.ps1",
  "scripts/db-health.ps1",
  "docs/contracts/CONTRACT_REQUEST_CONTEXT.md",
  "docs/contracts/CONTRACT_CITY_CODE.md",
  "docs/contracts/CONTRACT_DAL_SCOPE.md",
  "docs/contracts/CONTRACT_DB_MIGRATION.md",
  "docs/architecture/03_XLB_REQUEST_CONTEXT_CITY_FOUNDATION.md",
  "docs/architecture/04_XLB_DATABASE_SCOPE_DAL_FOUNDATION.md",
  "backend/src/cityConfig/cityConfigService.ts",
  "backend/src/catalog/catalogService.ts",
  "backend/src/pricing/pricingService.ts",
  "db/migrations/004_cityconfig_catalog_pricing_foundation.sql",
  "docs/contracts/CONTRACT_CITY_CONFIG.md",
  "docs/contracts/CONTRACT_CATALOG.md",
  "docs/contracts/CONTRACT_PRICING.md",
  "docs/architecture/05_XLB_CITYCONFIG_CATALOG_PRICING_FOUNDATION.md",
  "tests/unit/cityResolver.test.ts",
  "tests/unit/scopedExecutor.test.ts",
  "tests/unit/adminQueryGuard.test.ts",
  "tests/unit/repositoryBase.test.ts",
  "tests/integration/dbHealth.test.ts",
  "tests/contract/requestContext.contract.test.ts",
  "tests/security/noMissingCityCode.test.ts",
  "tests/security/noUnscopedQuery.test.ts",
  "tests/security/adminScopeLeak.test.ts",
  ".github/workflows/ci.yml",
  ".github/workflows/architecture-guard.yml",
  ".cursor/rules/xlb-architecture-mandatory.mdc",
  "docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md",
  "docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md",
  "docs/contracts/README.md"
)

$requiredDirs = @(
  "apps",
  "packages",
  "backend",
  "db",
  "infra",
  "deploy",
  "tests",
  "docs",
  "scripts",
  ".github",
  ".cursor",
  "apps/customer",
  "apps/worker",
  "apps/admin",
  "packages/types",
  "packages/validators",
  "packages/config",
  "packages/api-client",
  "packages/ui",
  "packages/module-loader",
  "backend/src/context",
  "backend/src/city",
  "backend/src/gateway",
  "backend/src/dal",
  "docs/architecture",
  "docs/contracts"
)

$missing = @()

foreach ($f in $requiredFiles) {
  $path = Join-Path $Root $f
  if (-not (Test-Path $path)) {
    $missing += $f
  }
}

foreach ($d in $requiredDirs) {
  $path = Join-Path $Root $d
  if (-not (Test-Path $path)) {
    $missing += "$d/"
  }
}

if ($missing.Count -gt 0) {
  Write-Host "XLB architecture preflight FAILED."
  Write-Host "Missing:"
  $missing | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "XLB Phase 0 architecture preflight passed."
Write-Host "XLB Phase 1 request-context-city preflight passed."
Write-Host "XLB Phase 2 database-scope-dal preflight passed."
Write-Host "XLB Phase 3 cityconfig-catalog-pricing preflight passed."
