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
  "db/migrations/005_official_pricing_display_fields.sql",
  "db/seed/006_disable_demo_catalog.seed.sql",
  "db/seed/007_official_catalog.seed.sql",
  "db/seed/008_official_pricing.seed.sql",
  "scripts/generate-official-catalog-seeds.mjs",
  "docs/contracts/CONTRACT_CITY_CONFIG.md",
  "docs/contracts/CONTRACT_CATALOG.md",
  "docs/contracts/CONTRACT_PRICING.md",
  "docs/architecture/05_XLB_CITYCONFIG_CATALOG_PRICING_FOUNDATION.md",
  "docs/catalog/OFFICIAL_SERVICE_CATALOG_IMPORT_SPEC.md",
  "docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md",
  "docs/catalog/OFFICIAL_SERVICE_CATALOG_SEED_PLAN.md",
  "scripts/check-official-catalog-ready.ps1",
  "scripts/check-no-demo-catalog-for-phase4.ps1",
  "tests/security/officialCatalogRequiredBeforeOrder.test.ts",
  "tests/security/noDemoCatalogForPhase4.test.ts",
  "tests/contract/officialCatalogSource.contract.test.ts",
  "tests/contract/officialCatalogSeed.contract.test.ts",
  "tests/contract/officialPricingSeed.contract.test.ts",
  "backend/src/order/orderService.ts",
  "backend/src/payment/paymentOrderService.ts",
  "backend/src/events/eventOutbox.ts",
  "db/migrations/006_order_payment_outbox_foundation.sql",
  "docs/contracts/CONTRACT_ORDER.md",
  "docs/contracts/CONTRACT_PAYMENT.md",
  "docs/contracts/CONTRACT_EVENT_OUTBOX.md",
  "docs/architecture/06_XLB_ORDER_PAYMENT_OUTBOX_FOUNDATION.md",
  "scripts/check-payment-no-dispatch.ps1",
  "scripts/check-order-requires-official-sku.ps1",
  "scripts/check-outbox-required.ps1",
  "tests/unit/orderStateMachine.test.ts",
  "tests/integration/orderCreate.test.ts",
  "tests/security/paymentNoDispatch.test.ts",
  "backend/src/dispatch/dispatchService.ts",
  "backend/src/dispatch/dispatchRepository.ts",
  "backend/src/streams/cityStreamNames.ts",
  "backend/src/streams/dispatchStreamPublisher.ts",
  "db/migrations/007_dispatch_outbox_city_stream_foundation.sql",
  "docs/contracts/CONTRACT_DISPATCH_STREAM.md",
  "docs/architecture/07_XLB_DISPATCH_OUTBOX_CITY_STREAM_FOUNDATION.md",
  "scripts/check-no-national-dispatch-stream.ps1",
  "scripts/check-dispatch-consumes-outbox-only.ps1",
  "scripts/check-no-payment-to-dispatch-import.ps1",
  "scripts/check-dispatch-no-worker-assignment-yet.ps1",
  "tests/unit/cityStreamNames.test.ts",
  "tests/integration/dispatchRunOnce.test.ts",
  "tests/security/noNationalDispatchStream.test.ts",
  "backend/src/worker/taskPoolService.ts",
  "backend/src/worker/workerRepository.ts",
  "db/migrations/008_worker_pool_taskpool_readiness_foundation.sql",
  "db/seed/009_worker_demo.seed.sql",
  "docs/contracts/CONTRACT_WORKER_TASK_POOL.md",
  "docs/architecture/08_XLB_WORKER_POOL_TASKPOOL_READINESS_FOUNDATION.md",
  "scripts/check-worker-taskpool-readonly.ps1",
  "scripts/check-no-worker-accept-in-phase5b.ps1",
  "scripts/check-no-fulfillment-in-worker-phase5b.ps1",
  "scripts/check-worker-taskpool-city-scoped.ps1",
  "tests/integration/workerTaskPoolApi.test.ts",
  "tests/security/noWorkerAcceptInPhase5B.test.ts",
  "backend/src/compliance/workerCertification/workerCertificationService.ts",
  "backend/src/compliance/certMatcher/workerDispatchEligibility.ts",
  "backend/src/compliance/qualification/qualificationService.ts",
  "db/migrations/009_certification_worker_eligibility_foundation.sql",
  "db/seed/010_certification_demo.seed.sql",
  "docs/contracts/CONTRACT_WORKER_CERTIFICATION.md",
  "docs/contracts/CONTRACT_WORKER_QUALIFICATION.md",
  "docs/contracts/CONTRACT_WORKER_ELIGIBILITY.md",
  "docs/architecture/09_XLB_CERTIFICATION_WORKER_ELIGIBILITY_FOUNDATION.md",
  "scripts/check-certification-no-accept.ps1",
  "scripts/check-certification-city-scoped.ps1",
  "scripts/check-eligibility-no-dispatch-mutation.ps1",
  "scripts/check-worker-eligibility-required-before-accept.ps1",
  "tests/integration/workerCertificationApi.test.ts",
  "tests/integration/workerEligibilityApi.test.ts",
  "tests/security/noAcceptInPhase6.test.ts",
  "backend/src/worker/workerAcceptService.ts",
  "backend/src/worker/workerAcceptRepository.ts",
  "backend/src/fulfillment/fulfillmentService.ts",
  "backend/src/fulfillment/fulfillmentRepository.ts",
  "db/migrations/010_worker_accept_fulfillment_skeleton_foundation.sql",
  "docs/contracts/CONTRACT_WORKER_ACCEPT.md",
  "docs/contracts/CONTRACT_FULFILLMENT_SKELETON.md",
  "docs/architecture/10_XLB_WORKER_ACCEPT_FULFILLMENT_SKELETON_FOUNDATION.md",
  "scripts/check-accept-requires-eligibility.ps1",
  "scripts/check-accept-city-scoped.ps1",
  "scripts/check-fulfillment-skeleton-no-ledger.ps1",
  "scripts/check-no-payment-order-to-accept.ps1",
  "scripts/check-no-fulfillment-complete-in-phase7a.ps1",
  "tests/integration/workerAcceptApi.test.ts",
  "tests/security/acceptRequiresEligibility.test.ts",
  "backend/src/fulfillment/fulfillmentService.ts",
  "backend/src/fulfillment/fulfillmentRoutes.ts",
  "db/migrations/011_fulfillment_start_complete_foundation.sql",
  "docs/contracts/CONTRACT_FULFILLMENT_LIFECYCLE.md",
  "docs/architecture/11_XLB_FULFILLMENT_START_COMPLETE_FOUNDATION.md",
  "scripts/check-fulfillment-complete-no-ledger.ps1",
  "scripts/check-fulfillment-city-worker-scoped.ps1",
  "scripts/check-no-settlement-in-phase7b.ps1",
  "scripts/check-no-refund-aftersale-in-phase7b.ps1",
  "scripts/check-order-payment-not-mutated-by-fulfillment.ps1",
  "tests/integration/fulfillmentStartApi.test.ts",
  "tests/integration/fulfillmentCompleteApi.test.ts",
  "tests/contract/fulfillmentLifecycle.contract.test.ts",
  "backend/src/ledger/ledgerAccrualService.ts",
  "backend/src/ledger/ledgerOutboxConsumer.ts",
  "backend/src/ledger/ledgerRepository.ts",
  "db/migrations/012_ledger_accrual_foundation.sql",
  "docs/contracts/CONTRACT_LEDGER_ACCRUAL.md",
  "docs/architecture/12_XLB_LEDGER_ACCRUAL_FOUNDATION.md",
  "scripts/check-ledger-consumes-outbox-only.ps1",
  "scripts/check-ledger-no-settlement-payout.ps1",
  "scripts/check-ledger-city-scoped.ps1",
  "scripts/check-fulfillment-no-direct-ledger.ps1",
  "scripts/check-ledger-no-refund-aftersale.ps1",
  "scripts/check-ledger-no-order-payment-mutation.ps1",
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
  "docs/contracts",
  "docs/catalog"
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

$catalogTsvDir = Join-Path $Root "docs\catalog"
$catalogTsvFiles = @(Get-ChildItem -LiteralPath $catalogTsvDir -Filter "*.tsv" -ErrorAction SilentlyContinue)
if ($catalogTsvFiles.Count -eq 0) {
  $missing += "docs/catalog/*.tsv (official service catalog source TSV missing)"
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
Write-Host "XLB Phase 3A official catalog import protocol preflight passed."
Write-Host "XLB Phase 3A-1 official service catalog seed import preflight passed."
Write-Host "XLB Phase 4 order payment outbox foundation preflight passed."
Write-Host "XLB Phase 5A dispatch outbox city stream foundation preflight passed."
Write-Host "XLB Phase 5B worker pool taskpool readiness foundation preflight passed."
Write-Host "XLB Phase 6 certification worker eligibility foundation preflight passed."
Write-Host "XLB Phase 7A worker accept fulfillment skeleton foundation preflight passed."
Write-Host "XLB Phase 7B fulfillment start complete foundation preflight passed."
Write-Host "XLB Phase 8A ledger accrual foundation preflight passed."
