$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$migration056Plus = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 56
})
if ($migration056Plus.Count -ne 0) { throw "Phase27B B2 forbids migration 056 or later" }

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
  'SELECT payload_json FROM event_outbox',
  'FOR UPDATE',
  'sameNotificationProjection'
)) {
  if (-not (($policy + "`n" + $events).Contains($required))) {
    throw "B2 compatibility or source-lock boundary missing: $required"
  }
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
