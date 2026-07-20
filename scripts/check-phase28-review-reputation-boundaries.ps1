$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/CURRENT_STATE.md'
$phase29EntryPath = 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29ArchitecturePath = 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29ContractPath = 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29RegistryPath = 'docs/governance/phase-registry.json'
$phase29Authorized =
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

& (Join-Path $PSScriptRoot 'check-phase28-entry-boundaries.ps1')
if ($LASTEXITCODE -ne 0) { throw "Phase28 Entry Gate failed" }

$migrationPath = 'db/migrations/056_phase28_review_reputation.sql'
if (-not (Test-Path -LiteralPath $migrationPath)) {
  throw "Phase28 construction requires append-only migration 056"
}
$later = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 57
})
$expectedLater = @()
if ($phase29Authorized) { $expectedLater += '057_phase29_marketing_coupon.sql' }
if (Test-Path -LiteralPath 'db/migrations/058_stage2c2_migration_control.sql') {
  $expectedLater += '058_stage2c2_migration_control.sql'
}
$tkeCosMigrationPath = 'db/migrations/059_tke_cos_object_storage.sql'
$tkeCosSourceCommit = '8c28d81fc81c84805368c969c590a77bf2a95b91'
if (Test-Path -LiteralPath $tkeCosMigrationPath) {
  $tkeCosHash = (git hash-object -- $tkeCosMigrationPath).Trim()
  $lockedTkeCosHash = (git rev-parse "${tkeCosSourceCommit}:$tkeCosMigrationPath" 2>$null).Trim()
  if ($LASTEXITCODE -eq 0 -and $tkeCosHash -eq $lockedTkeCosHash) {
    $expectedLater += '059_tke_cos_object_storage.sql'
  }
}
$actualLaterNames = @($later.Name | Sort-Object) -join ','
$expectedLaterNames = @($expectedLater | Sort-Object) -join ','
if ($later.Count -ne $expectedLater.Count -or
    $actualLaterNames -ne $expectedLaterNames) {
  throw "Phase28 forbids migrations beyond its exact formally authorized successor ledger"
}

$migration056Hash = (git hash-object -- $migrationPath).Trim()
$lockedMigration056Hash = (git rev-parse "xlb-phase28-review-reputation^{}:$migrationPath").Trim()
if ($LASTEXITCODE -ne 0 -or $migration056Hash -ne $lockedMigration056Hash) {
  throw "locked migration 056 hash differs from the canonical Phase28 tag"
}

$migration = Get-Content -Raw -Encoding UTF8 -LiteralPath $migrationPath
$dataInserts = [regex]::Matches($migration, '(?im)^\s*INSERT\s+INTO\s+([a-z0-9_]+)')
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw "migration 056 must be schema-only with no review, subscriber, activation or backfill seed"
}
foreach ($required in @('event_major_version', 'order_reviews', 'city_code', 'worker_city_bindings', 'schema_migrations')) {
  if (-not $migration.Contains($required)) { throw "migration 056 lacks required integrity element: $required" }
}
foreach ($required in @('active_appeal_guard', 'uq_review_appeal_withdrawal_idempotency', 'withdrawn_at')) {
  if (-not $migration.Contains($required)) { throw "migration 056 lacks active-only appeal/withdrawal integrity: $required" }
}
if ($migration -notmatch "(?s)active_appeal_guard.*?status='open'.*?ELSE NULL") {
  throw "Phase28 appeal uniqueness must apply only while status is open"
}
if ($migration -match '(?i)ON\s+(DELETE|UPDATE)\s+CASCADE') {
  throw "Phase28 evidence and city-integrity foreign keys must not cascade"
}
if ($migration -match '(?i)(pending_moderation|visible|hidden).*(INSERT\s+INTO)|INSERT\s+INTO.*(pending_moderation|visible|hidden)') {
  throw "Phase28 migration must not seed moderation or reputation business rows"
}

$reviewFiles = @(Get-ChildItem backend/src/review -File -Filter '*.ts' -ErrorAction Stop)
$reputationFiles = @(Get-ChildItem backend/src/review -File -Filter 'reputation*.ts' -ErrorAction Stop)
if ($reviewFiles.Count -eq 0 -or $reputationFiles.Count -eq 0) {
  throw "Phase28 requires both canonical Review runtime and the event-derived Reputation module"
}
$reviewText = ($reviewFiles | ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }) -join "`n"
$reputationText = ($reputationFiles | ForEach-Object { Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName }) -join "`n"
$phase28Runtime = $reviewText + "`n" + $reputationText

$allBackend = (Get-ChildItem backend/src -Recurse -File -Filter '*.ts' | ForEach-Object {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
}) -join "`n"
$reviewWriterCount = [regex]::Matches($allBackend, '(?is)INSERT\s+INTO\s+order_reviews\b').Count
if ($reviewWriterCount -ne 1) { throw "Phase28 requires exactly one canonical INSERT writer for order_reviews; found $reviewWriterCount" }
if ($allBackend -match '(?is)(UPDATE|DELETE\s+FROM)\s+order_reviews\b') {
  throw "Phase28 forbids mutation or physical deletion of immutable order_reviews"
}

$protected = 'orders|payment_orders|dispatch_tasks|dispatch_offers|ledger_entries|ledger_accruals|settlement_batches|worker_profiles|worker_city_bindings|worker_certifications|support_tickets'
if ($phase28Runtime -match "(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?($protected)\b") {
  throw "Review/Reputation runtime contains a protected-domain write"
}

$dispatchText = (Get-ChildItem backend/src/dispatch -Recurse -File -Filter '*.ts' | ForEach-Object {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
}) -join "`n"
if ($dispatchText -match '(?i)reputation|worker_reputation|review_rating') {
  throw "Phase28 forbids Dispatch from reading or importing Reputation"
}

if ($phase28Runtime -match '(?i)review.?reply|reply.?recorded') {
  throw "Phase28 defers Worker Reply and forbids reply runtime/events"
}
if ($phase28Runtime -match '(?i)physical.?delete|purge|deleteReview') {
  throw "Phase28 forbids physical review deletion and purge capability"
}
if ($phase28Runtime -match '(?i)\b(sms|wechat|email|push.?provider|external.?provider)\b') {
  throw "Phase28 forbids external Provider coupling"
}

$service = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/review/orderReviewService.ts'
$snapshotIndex = $service.IndexOf('lockOwnedOrder')
$existingIndex = $service.IndexOf('findByOrderForUpdate')
if ($snapshotIndex -lt 0 -or $existingIndex -lt 0 -or $snapshotIndex -gt $existingIndex) {
  throw "Review owner/reviewable-order validation must precede existing-review lookup"
}

$routes = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/review/orderReviewRoutes.ts'
$package = Get-Content -Raw -Encoding UTF8 -LiteralPath 'package.json'
if (-not $package.Contains('tests/contract/reviewReputationApiClient.contract.test.ts')) {
  throw "Phase28 unit gate must include the Review/Reputation API-client contract suite"
}
if (-not $routes.Contains('/api/worker/review-appeal-targets')) {
  throw "Worker appeal right requires the privacy-minimized self appeal-target endpoint"
}
if (-not $routes.Contains('/api/worker/reputation')) {
  throw "Worker Reputation requires the canonical self-scoped endpoint"
}
if (-not $routes.Contains('/api/admin/reviews/:reviewId/content')) {
  throw "Review content requires the dedicated single-item Admin route"
}
if (-not $routes.Contains('/api/reviews/:reviewId/appeals/withdraw')) {
  throw "Phase28 reachable appeal state machine requires the idempotent owner withdrawal route"
}
$cursorPolicyPath = 'backend/src/review/reviewQueueCursorPolicy.ts'
if (-not (Test-Path -LiteralPath $cursorPolicyPath)) {
  throw "Phase28 queue lists require a signed opaque cursor policy"
}
$cursorPolicy = Get-Content -Raw -Encoding UTF8 -LiteralPath $cursorPolicyPath
foreach ($required in @('createHmac','timingSafeEqual','kind','cityCode','role','filter')) {
  if (-not $cursorPolicy.Contains($required)) { throw "Phase28 signed cursor lacks scope/integrity marker: $required" }
}
$moderationService = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/review/reviewModerationService.ts'
if ($moderationService -notmatch '(?s)listModeration.*?Number\(rawLimit\) \+ 1.*?nextCursor' -or
    $moderationService -notmatch '(?s)listAppeals.*?Number\(rawLimit\) \+ 1.*?nextCursor') {
  throw "Phase28 moderation and appeal queues require bounded limit+1 keyset pagination"
}
if ($moderationService -notmatch '(?s)listModeration\s*\(.*?listModerationQueue\s*\(.*?,\s*false\s*[,\)]') {
  throw "Moderation queues must remain redacted for every role"
}
if (-not $moderationService.Contains('moderation_detail')) {
  throw "Dedicated Review content reads require moderation_detail audit purpose"
}
$moderationRepository = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/review/reviewModerationRepository.ts'
$appealTargetQuery = [regex]::Match(
  $moderationRepository,
  '(?s)listWorkerAppealTargets\s*\(.*?LIMIT\s+(?<limit>\d+)'
)
if (-not $appealTargetQuery.Success -or [int]$appealTargetQuery.Groups['limit'].Value -gt 100) {
  throw "Worker appeal-target response must be bounded to at most 100 items"
}
$reviewTypes = Get-Content -Raw -Encoding UTF8 -LiteralPath 'packages/types/src/review.ts'
$appealTargetType = [regex]::Match(
  $reviewTypes,
  '(?s)interface\s+WorkerReviewAppealTarget\s*\{(?<body>.*?)\}'
)
if (-not $appealTargetType.Success) { throw "Worker appeal-target type is missing" }
$appealTargetBody = $appealTargetType.Groups['body'].Value
foreach ($required in @('reviewId','visibility','moderationVersion','decidedAt','activeAppealStatus')) {
  if ($appealTargetBody -notmatch "(?m)^\s*$required\s*:") {
    throw "Worker appeal-target type missing exact field: $required"
  }
}
foreach ($forbidden in @('comment','rating','orderId','customerId','reason','actorId','moderatorId')) {
  if ($appealTargetBody -match "(?m)^\s*$forbidden\s*:") {
    throw "Worker appeal-target type contains forbidden field: $forbidden"
  }
}
$appealTargetFieldCount = [regex]::Matches(
  $appealTargetBody,
  '(?m)^\s*[A-Za-z][A-Za-z0-9]*\s*:'
).Count
if ($appealTargetFieldCount -ne 5) {
  throw "Worker appeal-target type must expose exactly five fields; found $appealTargetFieldCount"
}

$customerSources = (Get-ChildItem apps/customer/src -Recurse -File -Include '*.ts','*.tsx' | ForEach-Object {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
}) -join "`n"
if ($customerSources.Contains('Service completed as expected')) {
  throw "Customer Review UI must not fabricate a fallback comment"
}

$trace = Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/order/orderTraceRoutes.ts'
if ($trace -match '(?i)rev\.comment|review_comment') {
  throw "ordinary Admin order trace must not expose raw Review comment"
}

$eventRuntime = (Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/events/platformDeliveryService.ts') + "`n" +
  (Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/events/platformEventCompatibility.ts') + "`n" +
  (Get-Content -Raw -Encoding UTF8 -LiteralPath 'backend/src/events/platformDeliveryRepository.ts')
foreach ($required in @('review.created', 'eventMajorVersion', 'event_major_version')) {
  if (-not (($eventRuntime + "`n" + $reviewText).Contains($required))) {
    throw "Phase28 exact-major delivery path missing: $required"
  }
}
if (-not (($eventRuntime + "`n" + $reviewText) -match '(?s)review\.created.{0,1600}(eventMajorVersion\s*:\s*1|event_major_version.{0,100}\b1\b)')) {
  throw "review.created must be bound to exact major version 1"
}

$contractText = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/contracts/CONTRACT_REVIEW_REPUTATION.md'
if (-not $contractText.Contains('review.appeal.review')) {
  throw "Phase28 contract must freeze a dedicated appeal-review permission mapping"
}
foreach ($required in @(
  'review.visibility.changed',
  'reviewId',
  'workerId',
  'rating',
  'fromVisibility',
  'toVisibility',
  'moderationVersion',
  'occurredAt',
  'exactly seven payload fields'
)) {
  if (-not $contractText.Contains($required)) {
    throw "review.visibility.changed@1 contract missing: $required"
  }
}
foreach ($forbidden in @('decisionId', 'decisionVersion', 'reasonCode', 'comment', 'customerId', 'cityCode')) {
  if (-not $contractText.Contains("``$forbidden``")) {
    throw "review.visibility.changed@1 forbidden-field ledger missing: $forbidden"
  }
}

$eventSchemaText = Get-Content -Raw -Encoding UTF8 -LiteralPath 'packages/validators/src/eventOutboxSchema.ts'
$visibilitySchema = [regex]::Match(
  $eventSchemaText,
  '(?s)reviewVisibilityChangedV1EventPayloadSchema\s*=\s*z\.object\(\{(?<body>.*?)\}\)\.strict'
)
if (-not $visibilitySchema.Success) {
  throw "review.visibility.changed@1 requires an explicit strict validator"
}
$visibilityBody = $visibilitySchema.Groups['body'].Value
foreach ($required in @('reviewId','workerId','rating','fromVisibility','toVisibility','moderationVersion','occurredAt')) {
  if ($visibilityBody -notmatch "(?m)^\s*$required\s*:") {
    throw "review.visibility.changed@1 validator missing exact field: $required"
  }
}
foreach ($forbidden in @('decisionId','decisionVersion','reasonCode','comment','customerId','cityCode')) {
  if ($visibilityBody -match "(?m)^\s*$forbidden\s*:") {
    throw "review.visibility.changed@1 validator contains forbidden field: $forbidden"
  }
}
$fieldCount = [regex]::Matches($visibilityBody, '(?m)^\s*[A-Za-z][A-Za-z0-9]*\s*:').Count
if ($fieldCount -ne 7) {
  throw "review.visibility.changed@1 validator must expose exactly seven fields; found $fieldCount"
}

$seedText = (Get-ChildItem db/seed -File -ErrorAction SilentlyContinue | ForEach-Object {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $_.FullName
}) -join "`n"
if ($seedText -match '(?i)review\.created|review_reputation|worker_reputation|review_moderation|review_appeal') {
  throw "Phase28 forbids subscriber, review, moderation, reputation or backfill seed activation"
}

$phase28ChangedPaths = @(
  git diff --name-only 'xlb-phase27-notification-foundation^{}'
  git ls-files --others --exclude-standard
) | Sort-Object -Unique
$phase29Paths = @($phase28ChangedPaths | Where-Object {
  $_ -match '(?i)(^|/)(marketing|growth)(/|$)|phase29'
})
if (-not $phase29Authorized -and $phase29Paths.Count -ne 0) {
  throw "Phase28 change set contains Phase29 Marketing/Growth paths: $($phase29Paths -join ', ')"
}

Write-Output "check-phase28-review-reputation-boundaries: passed"
