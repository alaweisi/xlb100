$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

& (Join-Path $PSScriptRoot 'check-phase29-entry-boundaries.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Phase29 Entry Gate failed' }

function Require-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Phase29 required file missing: $Path" }
}

function Require-Contains([string]$Text, [string]$Needle, [string]$Label) {
  if (-not $Text.Contains($Needle)) { throw "Phase29 boundary evidence missing: $Label" }
}

$phase28Tag = 'xlb-phase28-review-reputation'
$migrationPath = 'db/migrations/057_phase29_marketing_coupon.sql'
$requiredFiles = @(
  $migrationPath,
  'scripts/run-phase29-migration-gate.mjs',
  'db/dictionary/TABLES.md',
  'db/dictionary/CITY_CODE_COLUMNS.md',
  'db/dictionary/SHARDING_KEYS.md',
  'packages/types/src/marketing.ts',
  'packages/validators/src/marketingSchema.ts',
  'packages/api-client/src/marketing.ts',
  'apps/customer/src/pages/CustomerCouponsPage.tsx',
  'apps/admin/src/pages/MarketingOperationsPage.tsx'
)
$requiredFiles | ForEach-Object { Require-File $_ }

$migration = Get-Content -Raw -Encoding UTF8 -LiteralPath $migrationPath
foreach ($table in @(
  'marketing_campaigns',
  'marketing_rule_revisions',
  'coupon_definitions',
  'coupon_grants',
  'coupon_reservations',
  'coupon_redemptions',
  'marketing_discount_decisions',
  'marketing_compensations',
  'marketing_audit_records'
)) {
  Require-Contains $migration $table $table
}
$createdTables = [regex]::Matches($migration, '(?im)^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)')
if ($createdTables.Count -ne 9) {
  throw "migration 057 must create exactly nine Phase29 tables; found $($createdTables.Count)"
}
foreach ($required in @('city_code', 'CNY', 'schema_migrations', 'compensation_cap')) {
  Require-Contains $migration $required $required
}

$dataInserts = [regex]::Matches($migration, '(?im)^\s*INSERT\s+INTO\s+([a-z0-9_]+)')
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw 'migration 057 must be schema-only and may insert only its schema_migrations marker'
}
if ($migration -match '(?i)ON\s+(DELETE|UPDATE)\s+CASCADE') {
  throw 'Phase29 business evidence must not cascade-delete or cascade-update'
}
if ($migration -match '(?i)CREATE\s+(TRIGGER|EVENT|PROCEDURE|FUNCTION)') {
  throw 'Phase29 migration must not create triggers, schedulers, procedures, or functions'
}
if ($migration -match '(?i)INSERT\s+INTO\s+(platform_event_subscriptions|platform_event_deliveries)') {
  throw 'Phase29 migration must not activate subscriptions or create deliveries'
}
if ([regex]::Matches($migration, "(?i)city_code\s*<>\s*'__global__'").Count -lt 9) {
  throw 'Every Phase29 business table must reject __global__ city rows'
}

$databaseDocs = @(
  Get-Content -Raw -Encoding UTF8 -LiteralPath 'db/dictionary/TABLES.md'
  Get-Content -Raw -Encoding UTF8 -LiteralPath 'db/dictionary/CITY_CODE_COLUMNS.md'
  Get-Content -Raw -Encoding UTF8 -LiteralPath 'db/dictionary/SHARDING_KEYS.md'
) -join "`n"
foreach ($required in @('Phase 29', 'marketing_campaigns', 'marketing_discount_decisions', 'coupon_redemptions')) {
  Require-Contains $databaseDocs $required "database dictionary: $required"
}

$lockedMigrationChanges = @(git diff --name-only "$phase28Tag^{}" -- db/migrations | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -le 56
})
if ($lockedMigrationChanges.Count -gt 0) {
  throw "Phase29 modified locked migration(s): $($lockedMigrationChanges -join ', ')"
}
$later = @(Get-ChildItem db/migrations -File | Where-Object { $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -gt 57 })
if ($later.Count -gt 0) { throw "Phase29 forbids migration 058 or later: $($later.Name -join ', ')" }

$workerChanges = @(git diff --name-only "$phase28Tag^{}" -- apps/worker)
if ($workerChanges.Count -gt 0) {
  throw "Phase29 coupon-first MVP forbids Worker UI changes: $($workerChanges -join ', ')"
}

$entryGate = Get-Content -Raw -Encoding UTF8 -LiteralPath 'scripts/check-phase29-entry-boundaries.ps1'
Require-Contains $entryGate 'git merge-base HEAD $phase28Commit' 'Phase28 predecessor ancestry verification'
$preflight = Get-Content -Raw -Encoding UTF8 -LiteralPath 'scripts/preflight-architecture.ps1'
foreach ($historicalGate in @(
  'check-phase27a-platform-delivery-boundaries.ps1',
  'check-phase27b-notification-projection-boundaries.ps1',
  'check-phase27b-b2-notification-runtime-boundaries.ps1',
  'check-phase27c-notification-api-boundaries.ps1',
  'check-phase27d-notification-ui-boundaries.ps1',
  'check-phase27-completion-boundaries.ps1',
  'check-phase28-review-reputation-boundaries.ps1'
)) {
  Require-Contains $preflight $historicalGate "preflight historical Gate $historicalGate"
}
if ($preflight.Contains('$phase29Construction')) {
  throw 'Phase29 preflight must not skip locked Phase27/28 historical Gates when migration 057 exists'
}

$executionFiles = @(
  'backend/src/marketing',
  'backend/src/order/orderService.ts',
  'packages/api-client/src/marketing.ts',
  'apps/customer/src/pages/CustomerCouponsPage.tsx',
  'apps/customer/src/adapters/marketingAdapter.ts',
  'apps/admin/src/pages/MarketingOperationsPage.tsx',
  'apps/admin/src/adapters/marketingAdapter.ts'
) | Where-Object { Test-Path -LiteralPath $_ }
$executionText = ($executionFiles | ForEach-Object {
  if ((Get-Item -LiteralPath $_).PSIsContainer) {
    Get-ChildItem -LiteralPath $_ -Recurse -File | Where-Object { $_.Extension -in @('.ts', '.tsx') } | ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }
  } else {
    Get-Content -Raw -Encoding UTF8 -LiteralPath $_
  }
}) -join "`n"

if ($executionText -match '(?i)discountRuleId') {
  throw 'Phase29 execution paths must never read Campaign.discountRuleId'
}
$marketingRuntime = if (Test-Path 'backend/src/marketing') {
  (Get-ChildItem 'backend/src/marketing' -Recurse -File | Where-Object { $_.Extension -eq '.ts' } | ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }) -join "`n"
} else { '' }
if ($marketingRuntime -match '(?i)pricingOverride') {
  throw 'Marketing must not reuse the Enterprise pricingOverride seam'
}
if ($marketingRuntime -match '(?is)\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+(orders|payment_orders|price_rules|ledger_|settlement_)') {
  throw 'Marketing runtime must not directly write Pricing, Order, Payment, Ledger or Settlement source tables'
}
if ($marketingRuntime -match '(?i)(alibaba|aliyun|wechat|provider.*execute|historical.*backfill|replay.*historical)') {
  throw 'Phase29 runtime contains prohibited Provider or historical processing code'
}

$orderService = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/order/orderService.ts'
foreach ($requiredOrderBoundary in @(
  'findAcceptedOrderReplay',
  'prepareDecisionForOrder',
  'commitPreparedDecisionAcceptance',
  'marketing.coupon.reserved',
  'marketing.coupon.redeemed',
  'enterprise agreement pricing and Marketing discount are mutually exclusive'
)) {
  Require-Contains $orderService $requiredOrderBoundary "Order/Marketing atomic boundary $requiredOrderBoundary"
}
$orderRepository = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/order/orderRepository.ts'
Require-Contains $orderRepository 'updatePriceSnapshot' 'Order snapshot evidence update'
if ($orderService -match '(?is)\b(UPDATE|DELETE)\s+(payment_orders|ledger_|settlement_)') {
  throw 'Phase29 Order integration must not mutate Payment, Ledger or Settlement tables'
}
$orderSchema = Get-Content -Raw -Encoding UTF8 -LiteralPath 'packages/validators/src/orderSchema.ts'
foreach ($forgedMoneyField in @('grossAmountMinor', 'discountAmountMinor', 'netAmountMinor')) {
  if ($orderSchema -notmatch ([regex]::Escape($forgedMoneyField) + ':\s*z\.never\(\)')) {
    throw "Phase29 Order command must reject client-authored $forgedMoneyField"
  }
}

$platformDiff = @(git diff --unified=0 "$phase28Tag^{}" -- backend/src/events/platformDeliveryService.ts backend/src/events/platformEventCompatibility.ts packages/types/src/platformDelivery.ts packages/validators/src/platformDeliverySchema.ts)
$platformAdded = ($platformDiff | Where-Object {
  $_.StartsWith('+') -and -not $_.StartsWith('+++')
} | ForEach-Object { $_.Substring(1) }) -join "`n"
foreach ($requiredCompatibility in @(
  'order.reverse.applied',
  'refund.approved',
  'projectClaimForMarketingCompensation',
  'revalidateMarketingCompensationProjectionClaim'
)) {
  Require-Contains $platformAdded $requiredCompatibility "dormant compatibility $requiredCompatibility"
}
if ($platformAdded -match '(?is)INSERT\s+INTO\s+platform_event_(subscribers|subscriptions|deliveries)' -or
    $platformAdded -match '(?i)(runOnce|scheduler|setInterval|live_start|historical.*replay|backfill)') {
  throw 'Phase29 compatibility additions must remain dormant and may not activate subscribers, deliveries, workers, replay, or backfill'
}

$client = Get-Content -Raw -Encoding UTF8 -LiteralPath 'packages/api-client/src/marketing.ts'
foreach ($route in @(
  '/api/customer/marketing/coupon-grants',
  '/api/customer/marketing/discount-decisions',
  '/api/admin/marketing/campaigns',
  '/rule-revisions',
  '/review',
  '/publish',
  '/api/admin/marketing/coupon-definitions',
  '/api/admin/marketing/coupon-grants'
)) {
  Require-Contains $client $route $route
}
if ($client -match 'client\.get<CouponGrantListResponse>\(`/api/admin/marketing/coupon-grants') {
  throw 'The accepted Phase29 contract does not expose an Admin coupon-grant list endpoint'
}

$customerSurface = @(
  Get-Content -Raw -Encoding UTF8 -LiteralPath 'apps/customer/src/pages/CustomerCouponsPage.tsx'
  Get-Content -Raw -Encoding UTF8 -LiteralPath 'apps/customer/src/pages/CustomerOrderCreatePage.tsx'
) -join "`n"
if ($customerSurface -match '(?i)(grossAmountMinor\s*-|faceValueMinor\s*-|discountAmountMinor\s*[+*/-])') {
  throw 'Customer UI must not calculate discount or eligibility locally'
}

Write-Output 'check-phase29-marketing-coupon-boundaries: passed'
