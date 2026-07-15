$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$migration056Plus = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 56
})
$phase28DecisionPath = 'docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md'
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/CURRENT_STATE.md'
$phase28Authorized =
  $currentState.Contains('Phase 27 | LOCKED') -and
  (Test-Path -LiteralPath $phase28DecisionPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase28DecisionPath).Contains('HUMAN APPROVED')
$phase29EntryPath = 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29ArchitecturePath = 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29ContractPath = 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29RegistryPath = 'docs/governance/phase-registry.json'
$phase29Authorized =
  $phase28Authorized -and
  ($currentState.Contains('Marketing / Coupon MVP (IN PROGRESS)') -or
   $currentState.Contains('Marketing / Coupon MVP (LOCKED)')) -and
  $currentState.Contains('approved Entry decisions D01') -and
  $currentState.Contains('D24 and authorized continuous Phase29 construction through independent acceptance.') -and
  $currentState.Contains('migration `057` only') -and
  (Test-Path -LiteralPath $phase29EntryPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29EntryPath).Contains('Every row below is **HUMAN APPROVED**') -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29EntryPath).Contains('| D24 |') -and
  (Test-Path -LiteralPath $phase29ArchitecturePath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29ArchitecturePath).Contains('ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED') -and
  (Test-Path -LiteralPath $phase29ContractPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29ContractPath).Contains('Phase 29 human-approved contract') -and
  (Test-Path -LiteralPath $phase29RegistryPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29RegistryPath).Contains('Entry decisions D01-D24 are approved for continuous construction through independent acceptance.') -and
  (Test-Path -LiteralPath 'db/migrations/057_phase29_marketing_coupon.sql')
$expectedPhase28Migration =
  $phase28Authorized -and
  $migration056Plus.Count -eq 1 -and
  $migration056Plus[0].Name -eq '056_phase28_review_reputation.sql'
$migration056PlusNames = @($migration056Plus.Name | Sort-Object) -join ','
$expectedPhase29Migrations =
  $phase29Authorized -and
  $migration056Plus.Count -eq 2 -and
  $migration056PlusNames -eq '056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql'
$expectedStage2c2Migrations =
  $phase29Authorized -and
  (Test-Path -LiteralPath 'db/migrations/058_stage2c2_migration_control.sql') -and
  $migration056Plus.Count -eq 3 -and
  $migration056PlusNames -eq '056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql,058_stage2c2_migration_control.sql'
if ($migration056Plus.Count -ne 0 -and -not $expectedPhase28Migration -and
    -not $expectedPhase29Migrations -and -not $expectedStage2c2Migrations) {
  throw "Phase27C forbids unauthorized migration 056 or later"
}

$requiredFiles = @(
  'backend/src/notification/notificationInboxPolicy.ts',
  'backend/src/notification/notificationInboxRepository.ts',
  'backend/src/notification/notificationInboxService.ts',
  'backend/src/notification/notificationModule.ts',
  'backend/src/routes/notificationRoutes.ts',
  'packages/api-client/src/notification.ts',
  'tests/integration/notificationInboxLifecycle.test.ts',
  'tests/security/phase27cNotificationApiBoundaries.test.ts'
)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Phase27C artifact: $file" }
}

$policy = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationInboxPolicy.ts'
$repository = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationInboxRepository.ts'
$service = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationInboxService.ts'
$routes = Get-Content -Raw -LiteralPath 'backend/src/routes/notificationRoutes.ts'
$client = Get-Content -Raw -LiteralPath 'packages/api-client/src/notification.ts'
$app = Get-Content -Raw -LiteralPath 'backend/src/app.ts'

foreach ($required in @(
  'context.appType !== expectedAppType',
  'context.role !== expectedAppType',
  'context.userId',
  'context.cityCode === "__global__"',
  'createHmac("sha256", cursorSecret())',
  'scopeHash',
  'view',
  'timingSafeEqual'
)) {
  if (-not $policy.Contains($required)) { throw "Phase27C scope/cursor boundary missing: $required" }
}
foreach ($required in @(
  'n.city_code=? AND n.recipient_type=? AND n.recipient_id=?',
  's.hidden_at IS NULL',
  's.read_at IS NULL AND s.archived_at IS NULL AND s.hidden_at IS NULL',
  'LIMIT 1 FOR UPDATE',
  'idempotency_key_hash',
  'request_fingerprint',
  'notification_actions',
  'row_version=row_version+1'
)) {
  if (-not $repository.Contains($required)) { throw "Phase27C repository boundary missing: $required" }
}
foreach ($required in @(
  '/api/${appType}/notifications',
  '/unread-count',
  '/:notificationId/read',
  '/:notificationId/archive',
  'createRequestContextMiddleware({ requireCityCode: true })'
)) {
  if (-not $routes.Contains($required)) { throw "Phase27C route boundary missing: $required" }
}
if ($routes -match '(?i)admin|dashboard|/oa') { throw "Phase27C must expose Customer/Worker routes only" }
if (-not $app.Contains('registerNotificationModule')) { throw "Phase27C Notification module is not registered" }

foreach ($required in @(
  'retry: "idempotent"',
  'validateNotificationInboxListResponse',
  'validateNotificationStateMutationResponse',
  'encodeURIComponent(notificationId)'
)) {
  if (-not $client.Contains($required)) { throw "Phase27C API Client boundary missing: $required" }
}

$runtime = $policy + "`n" + $repository + "`n" + $service + "`n" + $routes
if ($runtime -match '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?(orders|payment_orders|dispatch_tasks|ledger_entries|support_tickets|event_outbox|platform_event_)') {
  throw "Phase27C contains a protected-domain write"
}
if ($runtime -match '(?i)\b(sms|wechat|email|external.?channel|provider.?client|historical.?backfill|platform.?replay|physical.?delete|purge)\b') {
  throw "Phase27C contains an external channel, replay or deletion capability"
}
if ($repository -match '\bidempotencyKey\s*:') {
  throw "raw idempotency keys must not cross into Notification persistence"
}

Write-Output "check-phase27c-notification-api-boundaries: passed"
