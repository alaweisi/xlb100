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
  $currentState.Contains('Marketing / Coupon MVP (IN PROGRESS)') -and
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
$expectedPhase29Migrations =
  $phase29Authorized -and
  $migration056Plus.Count -eq 2 -and
  @($migration056Plus.Name | Sort-Object) -join ',' -eq
    '056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql'
if ($migration056Plus.Count -ne 0 -and -not $expectedPhase28Migration -and -not $expectedPhase29Migrations) {
  throw "Phase27B B2 forbids unauthorized migration 056 or later"
}
$migration055Path = 'db/migrations/055_phase27b_notification_projection_foundation.sql'
$migration055Hash = (git hash-object -- $migration055Path).Trim()
$lockedMigration055Hash = (git rev-parse "xlb-phase27-notification-foundation^{}:$migration055Path").Trim()
if ($LASTEXITCODE -ne 0 -or $migration055Hash -ne $lockedMigration055Hash) {
  throw "locked migration 055 hash differs from the canonical Phase27 tag"
}

$requiredFiles = @(
  'backend/src/notification/notificationProjectionWorker.ts',
  'backend/src/notification/notificationService.ts',
  'backend/src/notification/notificationRepository.ts',
  'backend/src/notification/notificationProjectionPolicy.ts',
  'docs/reports/PHASE27B_B2_NOTIFICATION_RUNTIME_DECISION_REPORT.md'
)
foreach ($file in $requiredFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Phase27B B2 artifact: $file" }
}

$worker = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationProjectionWorker.ts'
$service = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationService.ts'
$repository = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationRepository.ts'
$policy = Get-Content -Raw -LiteralPath 'backend/src/notification/notificationProjectionPolicy.ts'
$events = (Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryRepository.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryService.ts')

foreach ($required in @(
  'this.platformService.claim',
  'materializeClaimWithCurrentTemplate',
  'this.platformService.acknowledge',
  'this.platformService.fail'
)) {
  if (-not $worker.Contains($required)) { throw "B2 Phase27A lifecycle delegation missing: $required" }
}
foreach ($required in @(
  'resolveCurrentPublishedTemplateRevision',
  "t.status='published' AND r.status='published'",
  "r.locale='zh-CN' AND r.pii_level='P1'",
  'ORDER BY r.revision_number DESC',
  'notificationTemplateKey(projection)'
)) {
  if (-not (($repository + "`n" + $service).Contains($required))) {
    throw "B2 exact published-template policy missing: $required"
  }
}
foreach ($required in @(
  'inapp.order.created.customer',
  'inapp.support.ticket.resolved.',
  'source_snapshot_consistent',
  'FOR UPDATE',
  'sameNotificationProjection'
)) {
  if (-not (($policy + "`n" + $events).Contains($required))) {
    throw "B2 compatibility or source-lock boundary missing: $required"
  }
}
$expectedSourceLockSelect = if ($phase28Authorized) {
  'SELECT payload_json,event_major_version,aggregate_type,aggregate_id FROM event_outbox'
} else {
  'SELECT payload_json FROM event_outbox'
}
if (-not $events.Contains($expectedSourceLockSelect)) {
  throw "B2 compatibility or source-lock boundary missing: $expectedSourceLockSelect"
}

$executable = [regex]::Replace(($worker + "`n" + $service + "`n" + $repository), '(?s)/\*.*?\*/', '')
$executable = [regex]::Replace($executable, '(?m)^\s*//.*$', '')
if ($executable -match '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?(event_outbox|platform_event_)') {
  throw "B2 Notification runtime may not write Events or Platform Delivery state directly"
}
if ($executable -match '(?i)\b(backfill|replay|subscriber.?registration|template.?publication|sms|push|wechat|email|provider)\b') {
  throw "B2 executable runtime contains forbidden activation, replay or external-channel capability"
}

$publicEntry = (Get-Content -Raw -LiteralPath 'backend/src/app.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/server.ts')
if ($publicEntry -match 'NotificationProjectionWorker|notificationProjectionWorker|runOnce') {
  throw "B2 internal projection worker must not be auto-run or exposed publicly"
}

$migration = Get-Content -Raw -LiteralPath 'db/migrations/055_phase27b_notification_projection_foundation.sql'
$dataInserts = [regex]::Matches($migration, '(?im)^\s*INSERT\s+INTO\s+([a-z0-9_]+)')
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw "B2 must retain zero seed, subscriber, template and activation rows"
}

$testText = Get-Content -Raw -LiteralPath 'tests/integration/notificationProjectionLifecycle.test.ts'
foreach ($marker in @(
  'highest exact published template',
  'reuses that canonical receipt after ack loss',
  'acknowledges once',
  'no exact published template exists',
  'changed source payload'
)) {
  if (-not $testText.Contains($marker)) { throw "B2 lifecycle evidence missing: $marker" }
}

Write-Output "check-phase27b-b2-notification-runtime-boundaries: passed"
