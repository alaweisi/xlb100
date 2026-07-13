$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$baseline = '7874355837430b8a803f09be731265fb20889073'
& git cat-file -e "$baseline^{commit}"
if ($LASTEXITCODE -ne 0) { throw "Phase27B baseline commit is unavailable: $baseline" }

$migration055 = @(Get-ChildItem db/migrations -File | Where-Object { $_.Name -match '^055_' })
$migration056Plus = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 56
})
if ($migration055.Count -ne 1 -or $migration055[0].Name -ne '055_phase27b_notification_projection_foundation.sql') {
  throw "Phase27B requires exactly the approved migration 055"
}
if ($migration056Plus.Count -ne 0) { throw "Phase27B B1 forbids migration 056 or later" }

$changedPaths = @(
  @(git diff --name-only $baseline --) |
    ForEach-Object { $_.Replace('\', '/') }
  @(git ls-files --others --exclude-standard) |
    ForEach-Object { $_.Replace('\', '/') }
) | Sort-Object -Unique

foreach ($path in $changedPaths) {
  if ($path -match '^db/migrations/(\d{3})_') {
    $migrationNumber = [int]$Matches[1]
    if ($migrationNumber -le 54) {
      throw "Phase27B B1 must not modify locked migration: $path"
    }
  }
}

$allowed = @(
  '^backend/src/events/platformEventCompatibility\.ts$',
  '^backend/src/events/platformDeliveryRepository\.ts$',
  '^backend/src/events/platformDeliveryService\.ts$',
  '^backend/src/notification/notificationProjectionPolicy\.ts$',
  '^backend/src/notification/notificationRepository\.ts$',
  '^backend/src/notification/notificationService\.ts$',
  '^db/migrations/055_phase27b_notification_projection_foundation\.sql$',
  '^docs/CURRENT_STATE\.md$',
  '^docs/reports/PHASE27B_NOTIFICATION_PROJECTION_(ENTRY|IMPLEMENTATION)_REPORT\.md$',
  '^packages/types/src/(index|notification)\.ts$',
  '^packages/validators/src/(index|notificationSchema)\.ts$',
  '^scripts/check-phase27b-notification-projection-boundaries\.ps1$',
  '^scripts/run-phase27b-migration-gate\.mjs$',
  '^scripts/check-phase24-completion-boundaries\.ps1$',
  '^scripts/check-phase25-closure\.mjs$',
  '^scripts/check-phase25-gate1(a|b)\.mjs$',
  '^scripts/check-phase9(a|b|c)-no-migration\.ps1$',
  '^scripts/check-phase9(b|c|d|e)-forbidden-zone\.ps1$',
  '^scripts/check-phase12-only-preparation-table-writes\.ps1$',
  '^scripts/check-phase23b-boundaries\.ps1$',
  '^scripts/check-phase27a-platform-delivery-boundaries\.ps1$',
  '^tests/contract/notification\.contract\.test\.ts$',
  '^tests/unit/notificationProjectionPolicy\.test\.ts$',
  '^tests/integration/notificationProjectionLifecycle\.test\.ts$',
  '^tests/security/phase27bNotificationProjectionBoundaries\.test\.ts$',
  '^tests/security/phase27aPlatformDeliveryBoundaries\.test\.ts$'
)
foreach ($path in $changedPaths) {
  if (-not ($allowed | Where-Object { $path -match $_ })) {
    throw "out-of-scope Phase27B B1 path: $path"
  }
}

$requiredFiles = @(
  'backend/src/events/platformEventCompatibility.ts',
  'backend/src/events/platformDeliveryRepository.ts',
  'backend/src/events/platformDeliveryService.ts',
  'backend/src/notification/notificationProjectionPolicy.ts',
  'backend/src/notification/notificationRepository.ts',
  'backend/src/notification/notificationService.ts',
  'db/migrations/055_phase27b_notification_projection_foundation.sql',
  'packages/types/src/notification.ts',
  'packages/validators/src/notificationSchema.ts',
  'scripts/run-phase27b-migration-gate.mjs'
)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Phase27B B1 file: $file" }
}

$migrationPath = 'db/migrations/055_phase27b_notification_projection_foundation.sql'
$migrationText = Get-Content -Raw -LiteralPath $migrationPath
$migrationExecutableText = [regex]::Replace($migrationText, '(?m)^\s*--.*$', '')
$createdTables = @([regex]::Matches(
  $migrationExecutableText,
  '(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-z0-9_]+)`?'
) | ForEach-Object { $_.Groups[1].Value })
$expectedTables = @(
  'notification_templates',
  'notification_template_revisions',
  'notification_recipient_preferences',
  'notification_records',
  'notification_delivery_receipts',
  'notification_recipient_states',
  'notification_actions',
  'notification_tombstones'
)
if ($createdTables.Count -ne $expectedTables.Count) {
  throw "migration 055 must create exactly eight Notification tables"
}
foreach ($table in $expectedTables) {
  if ($createdTables -notcontains $table) { throw "migration 055 missing table: $table" }
}
foreach ($table in $createdTables) {
  if ($expectedTables -notcontains $table) { throw "migration 055 contains unapproved table: $table" }
}

$dataInserts = @([regex]::Matches($migrationExecutableText, '(?im)^\s*INSERT\s+INTO\s+`?([a-z0-9_]+)`?'))
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw "migration 055 must be empty schema with no seed, allowlist, template or activation rows"
}
if ($migrationExecutableText -match '(?i)ON\s+(DELETE|UPDATE)\s+CASCADE') {
  throw "Notification evidence foreign keys must not cascade"
}
if ($migrationExecutableText -match '(?i)\b(active_revision|active_template|is_active|activated_at|activation_status)\b') {
  throw "Phase27B B1 forbids an active template pointer or activation state"
}
if ($migrationExecutableText -match '(?i)\b(sms|push|wechat|email|external_channel|channel_intent|channel_attempt|provider_delivery)\b') {
  throw "Phase27B B1 external channel capability must remain absent"
}
if ($migrationExecutableText -match '(?i)\b(retry|retry_count|lease_owner|lease_token|lease_expires_at|next_attempt_at|dead_letter|dlq)\b') {
  throw "Notification must not create a second retry, lease or DLQ subsystem"
}
foreach ($required in @(
  'chk_notification_template_city',
  'uq_notification_record_business',
  'uq_notification_receipt_subscriber_event',
  'uq_notification_state_recipient',
  'chk_notification_tombstone_recipient_hash',
  'chk_notification_tombstone_target_hash',
  'chk_notification_tombstone_payload_hash',
  'chk_notification_tombstone_evidence_hash'
)) {
  if (-not $migrationText.Contains($required)) {
    throw "migration 055 lacks required isolation/idempotency constraint: $required"
  }
}

$migrationGateText = Get-Content -Raw -LiteralPath 'scripts/run-phase27b-migration-gate.mjs'
foreach ($required in @(
  'migrationText.slice(0, interruptionBoundary)',
  'partialTableCount !== "4"',
  'partialMarker !== "0"',
  'true-partial-DDL',
  'protectedSchemaSnapshot',
  'sourceDataSnapshot'
)) {
  if (-not $migrationGateText.Contains($required)) {
    throw "migration 055 Gate lacks replay/partial-DDL/protected-source evidence: $required"
  }
}

$handoffText = (Get-Content -Raw -LiteralPath 'backend/src/events/platformEventCompatibility.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryRepository.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryService.ts')
foreach ($required in @(
  'projectClaimForNotification',
  'PlatformNotificationCompatibilityProjection',
  'd.delivery_id=? AND d.city_code=? AND d.subscriber_id=? AND d.subscription_id=?',
  'd.lease_owner=? AND d.lease_token=?',
  'd.lease_expires_at>CURRENT_TIMESTAMP(3) AND d.row_version=?',
  'compatibility_handler_revision',
  'projectImplicitV0NotificationCompatibility',
  'projected.payloadHash !== source.payload_hash'
)) {
  if (-not $handoffText.Contains($required)) {
    throw "claim-scoped minimal compatibility handoff is missing: $required"
  }
}

$notificationFiles = @(
  'backend/src/notification/notificationProjectionPolicy.ts',
  'backend/src/notification/notificationRepository.ts',
  'backend/src/notification/notificationService.ts'
)
$notificationRuntimeText = ($notificationFiles | ForEach-Object {
  Get-Content -Raw -LiteralPath $_
}) -join "`n"
$notificationExecutableText = [regex]::Replace($notificationRuntimeText, '(?s)/\*.*?\*/', '')
$notificationExecutableText = [regex]::Replace($notificationExecutableText, '(?m)^\s*//.*$', '')
if ($notificationExecutableText -match '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?event_outbox`?\b') {
  throw "Notification runtime must never write source event_outbox"
}
if ($notificationExecutableText -match '(?i)claimEventsByType|acknowledgeClaim|failClaim|eventOutboxRepository|reapExpiredLeases') {
  throw "Notification runtime must not call the source Outbox lifecycle"
}
$protected = 'orders|payment_orders|dispatch_tasks|ledger_entries|ledger_accruals|business_webhook_deliveries|support_tickets'
$protectedWritePattern = '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?(' + $protected + ')`?\b'
if ($notificationExecutableText -match $protectedWritePattern) {
  throw "Notification runtime contains a protected-domain write"
}
if ($notificationExecutableText -match '(?i)\b(live.?start|backfill|replay|manual.?retry|sms|push|wechat|email|external.?channel|provider)\b') {
  throw "Phase27B B1 runtime contains an activation, replay, Admin or external-channel path"
}
if ($notificationExecutableText -match '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?platform_event_(deliveries|delivery_attempts|delivery_actions)`?\b') {
  throw "Notification runtime may validate but must not mutate the Phase27A delivery lifecycle"
}
foreach ($requiredClaimLock in @(
  'revalidateNotificationProjectionClaim',
  'readClaimCompatibilitySource',
  "d.status='processing' AND d.lease_owner=? AND d.lease_token=?",
  'd.lease_expires_at>CURRENT_TIMESTAMP(3) AND d.row_version=?',
  "s.status='active' AND p.status='active'",
  'lockForUpdate ? " FOR UPDATE"',
  'sameNotificationProjection'
)) {
  if (-not $handoffText.Contains($requiredClaimLock)) {
    throw "Events boundary must revalidate and lock the exact Phase27A claim inside the target transaction: $requiredClaimLock"
  }
}
if ($notificationExecutableText -match '(?i)\b(retry_count|next_attempt_at|dead_letter|dlq)\b') {
  throw "Notification runtime must not create an independent retry or DLQ lifecycle"
}
if ($notificationExecutableText -match '(?i)from\s+["''](?:express|fastify)["'']|\bRouter\s*\(|\bapp\.(get|post|put|patch|delete)\s*\(') {
  throw "Phase27B B1 must not expose a Notification API or public route"
}

$publicEntryText = (Get-Content -Raw -LiteralPath 'backend/src/app.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/server.ts')
if ($publicEntryText -match '(?i)notification') {
  throw "Phase27B B1 must not wire Notification into app.ts or server.ts"
}

$forbiddenChangedPathPatterns = @(
  '^apps/',
  '^packages/api-client/',
  '^backend/src/(app|server)\.ts$',
  '^backend/src/.+(Routes|Route|Controller|Provider)\.(ts|tsx)$',
  '(^|/)(admin|oa|dashboard)(/|$)',
  '(?i)(backfill|replay|live.?start|provider)'
)
foreach ($path in $changedPaths) {
  if ($forbiddenChangedPathPatterns | Where-Object { $path -match $_ }) {
    throw "Phase27B B1 contains forbidden API/UI/Admin/Provider/activation path: $path"
  }
}

Write-Output "check-phase27b-notification-projection-boundaries: passed"
