$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$violations = @()

$backendFiles = @(
  "backend/src/customer/customerOperationsService.ts",
  "backend/src/customer/customerOperationsRoutes.ts",
  "backend/src/adminOperations/adminOperationsService.ts",
  "backend/src/adminOperations/adminOperationsRoutes.ts"
)
$backend = ($backendFiles | ForEach-Object { Get-Content -Raw (Join-Path $Root $_) }) -join "`n"
foreach ($pattern in @("fetch\(", "axios", "amap", "alibaba.*oss", "payoutProvider", "paymentProvider")) {
  if ($backend -match $pattern) { $violations += "Phase 21 backend matched forbidden provider/execution pattern: $pattern" }
}

$migration = Get-Content -Raw (Join-Path $Root "db/migrations/040_phase21_customer_operations.sql")
foreach ($required in @("customer_addresses", "FOREIGN KEY (customer_id)", "FOREIGN KEY (city_code)", "city_code <> '__global__'")) {
  if (-not $migration.Contains($required)) { $violations += "Migration 040 missing: $required" }
}
$idempotencyMigration = Get-Content -Raw (Join-Path $Root "db/migrations/041_phase21_customer_address_idempotency.sql")
foreach ($required in @("idempotency_key", "uq_customer_address_idempotency", "customer_id, city_code, idempotency_key")) {
  if (-not $idempotencyMigration.Contains($required)) { $violations += "Migration 041 missing: $required" }
}

$workerApp = Get-Content -Raw (Join-Path $Root "apps/worker/src/app/App.tsx")
foreach ($required in @("getReceivableBalance", "createWithdrawalRequest", "getLocation", "upsertLocation")) {
  if (-not $workerApp.Contains($required)) { $violations += "Worker operations UI missing API binding: $required" }
}

$adminPage = Get-Content -Raw (Join-Path $Root "apps/admin/src/pages/PlatformOperationsPage.tsx")
foreach ($required in @("listOperationsOrders", "setOperationsSkuEnabled", "listWorkerCertifications")) {
  if (-not $adminPage.Contains($required)) { $violations += "Admin operations UI missing API binding: $required" }
}

if ($violations.Count -gt 0) { $violations | ForEach-Object { Write-Host $_ }; exit 1 }
Write-Host "check-phase21-boundaries: passed"
