$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/CURRENT_STATE.md'
$phase27bB1Authorized =
  $currentState.Contains('Phase 27B | B1 IMPLEMENTED') -or
  $currentState.Contains('Phase 27B | B1 ACCEPTED') -or
  $currentState.Contains('Phase 27B | B2 IMPLEMENTED') -or
  $currentState.Contains('Phase 27B | B2/C/D ACCEPTED') -or
  $currentState.Contains('Phase 27 | LOCKED')
$phase28DecisionPath = 'docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md'
$phase28Authorized =
  $phase27bB1Authorized -and
  (Test-Path -LiteralPath $phase28DecisionPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase28DecisionPath).Contains('HUMAN APPROVED') -and
  (Test-Path -LiteralPath 'db/migrations/056_phase28_review_reputation.sql')
$phase29EntryPath = 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29ArchitecturePath = 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29ContractPath = 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29RegistryPath = 'docs/governance/phase-registry.json'
$phase29MigrationPath = 'db/migrations/057_phase29_marketing_coupon.sql'
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
  (Test-Path -LiteralPath $phase29MigrationPath)
$stage2c2Authorized = Test-Path -LiteralPath 'db/migrations/058_stage2c2_migration_control.sql'
$tkeCosMigrationPath = 'db/migrations/059_tke_cos_object_storage.sql'
$tkeCosSourceCommit = '8c28d81fc81c84805368c969c590a77bf2a95b91'
$tkeCosAuthorized = $false
if (Test-Path -LiteralPath $tkeCosMigrationPath) {
  $tkeCosHash = (git hash-object -- $tkeCosMigrationPath).Trim()
  $lockedTkeCosHash = (git rev-parse "${tkeCosSourceCommit}:$tkeCosMigrationPath" 2>$null).Trim()
  $tkeCosAuthorized = $LASTEXITCODE -eq 0 -and $tkeCosHash -eq $lockedTkeCosHash
}

$migration054 = @(Get-ChildItem db/migrations -File | Where-Object { $_.Name -match '^054_' })
$migration055Plus = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 55
})
if ($migration054.Count -ne 1 -or $migration054[0].Name -ne '054_phase27a_platform_delivery_foundation.sql') {
  throw "Phase27A requires exactly the approved migration 054"
}
$migration054Path = 'db/migrations/054_phase27a_platform_delivery_foundation.sql'
$migration054Hash = (git hash-object -- $migration054Path).Trim()
$lockedMigration054Hash = (git rev-parse "xlb-phase27-notification-foundation^{}:$migration054Path").Trim()
if ($LASTEXITCODE -ne 0 -or $migration054Hash -ne $lockedMigration054Hash) {
  throw "locked migration 054 hash differs from the canonical Phase27 tag"
}
if ($migration055Plus.Count -ne 0) {
  $expectedPhase27bMigration =
    $phase27bB1Authorized -and
    $migration055Plus.Count -eq 1 -and
    $migration055Plus[0].Name -eq '055_phase27b_notification_projection_foundation.sql'
  $expectedPhase28Migrations =
    $phase28Authorized -and
    $migration055Plus.Count -eq 2 -and
    @($migration055Plus.Name | Sort-Object) -join ',' -eq
      '055_phase27b_notification_projection_foundation.sql,056_phase28_review_reputation.sql'
  $expectedPhase29Migrations =
    $phase29Authorized -and
    $migration055Plus.Count -eq 3 -and
    @($migration055Plus.Name | Sort-Object) -join ',' -eq
      '055_phase27b_notification_projection_foundation.sql,056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql'
  $expectedStage2c2Migrations =
    $phase29Authorized -and $stage2c2Authorized -and
    $migration055Plus.Count -eq 4 -and
    @($migration055Plus.Name | Sort-Object) -join ',' -eq
      '055_phase27b_notification_projection_foundation.sql,056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql,058_stage2c2_migration_control.sql'
  $expectedTkeCosMigrations =
    $phase29Authorized -and $stage2c2Authorized -and $tkeCosAuthorized -and
    $migration055Plus.Count -eq 5 -and
    @($migration055Plus.Name | Sort-Object) -join ',' -eq
      '055_phase27b_notification_projection_foundation.sql,056_phase28_review_reputation.sql,057_phase29_marketing_coupon.sql,058_stage2c2_migration_control.sql,059_tke_cos_object_storage.sql'
  if (-not $expectedPhase27bMigration -and -not $expectedPhase28Migrations -and
      -not $expectedPhase29Migrations -and -not $expectedStage2c2Migrations -and
      -not $expectedTkeCosMigrations) {
    throw "Phase27A forbids unauthorized migration 055 or later"
  }
}

$platformFiles = @(
  'backend/src/events/platformDeliveryPolicy.ts',
  'backend/src/events/platformEventCompatibility.ts',
  'backend/src/events/platformDeliveryRepository.ts',
  'backend/src/events/platformDeliveryService.ts'
)
foreach ($file in $platformFiles) {
  if (-not (Test-Path -LiteralPath $file)) { throw "missing Platform Delivery file: $file" }
}

$runtimeText = ($platformFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_ }) -join "`n"
if ($runtimeText -match '(?is)UPDATE\s+event_outbox|DELETE\s+FROM\s+event_outbox|INSERT\s+INTO\s+event_outbox') {
  throw "Platform Delivery runtime must never write source event_outbox"
}
if ($runtimeText -match 'claimEventsByType|acknowledgeClaim|failClaim|eventOutboxRepository\.reapExpiredLeases') {
  throw "Platform Delivery must not call the source Outbox claim lifecycle"
}

$protected = 'orders|payment_orders|dispatch_tasks|ledger_entries|ledger_accruals|business_webhook_deliveries|support_tickets'
if ($runtimeText -match "(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+($protected)\b") {
  throw "Platform Delivery runtime contains a protected-domain write"
}

$migrationText = Get-Content -Raw -LiteralPath 'db/migrations/054_phase27a_platform_delivery_foundation.sql'
$dataInserts = [regex]::Matches($migrationText, '(?im)^\s*INSERT\s+INTO\s+([a-z0-9_]+)')
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw "migration 054 must be schema-only with no seed/activation rows"
}
if ($migrationText -match '(?i)ON\s+DELETE\s+CASCADE|ON\s+UPDATE\s+CASCADE') {
  throw "Platform Delivery evidence FKs must not cascade"
}
foreach ($required in @(
  'subscription_id_copy',
  'compatibility_handler_revision_copy',
  'uq_platform_action_terminal_rejection',
  'chk_platform_action_rejection_identity'
)) {
  if (-not $migrationText.Contains($required)) {
    throw "migration 054 lacks bounded terminal rejection constraint: $required"
  }
}

$repositoryText = Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryRepository.ts'
$serviceText = Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryService.ts'
foreach ($required in @(
  'hasReconciliationGap',
  'recordPartialReconciliation',
  'commit_skew_risk',
  'r.action_kind=''materialization_rejected''',
  'd.subscription_id=?',
  'request.subscriptionId'
)) {
  if (-not (($repositoryText + "`n" + $serviceText).Contains($required))) {
    throw "Phase27A remediation boundary missing: $required"
  }
}
if (-not $serviceText.Contains('completeness: "partial"')) {
  throw "Phase27A reconciliation must return non-terminal partial evidence"
}
if ($runtimeText.Contains('"complete"') -or $runtimeText.Contains("'complete'")) {
  throw "Phase27A runtime must not contain an executable complete reconciliation result"
}
if ($runtimeText.Contains('recordReconciliation')) {
  throw "Phase27A must not retain the gap-check plus absolute reconciliation result writer"
}

$policyText = Get-Content -Raw -LiteralPath 'backend/src/events/platformDeliveryPolicy.ts'
foreach ($required in @(
  'PLATFORM_DELIVERY_CANONICAL_ERRORS',
  'projectPlatformDeliveryError',
  'PLATFORM_DELIVERY_ERROR: "platform delivery failed"',
  'INVALID_EVENT_PAYLOAD:',
  'UNSUPPORTED_EVENT_TYPE:',
  'UNSUPPORTED_EVENT_VERSION:',
  'CITY_SCOPE_MISMATCH:',
  'LEASE_EXPIRED:'
)) {
  if (-not $policyText.Contains($required)) {
    throw "strict error allowlist missing: $required"
  }
}
foreach ($forbidden in @(
  'sanitizePlatformDeliveryError',
  'platformDeliveryErrorCode',
  'String(error)',
  'error.message'
)) {
  if ($runtimeText.Contains($forbidden)) {
    throw "Platform Delivery runtime must not inspect or sanitize raw failures: $forbidden"
  }
}
if ($runtimeText -match '(?i)(console|logger)\s*\.\s*(log|error|warn|info|debug)') {
  throw "Platform Delivery runtime must not log raw error or payload values"
}

$migrationGateText = Get-Content -Raw -LiteralPath 'scripts/run-phase27a-migration-gate.mjs'
foreach ($required in @(
  'migrationText.slice(0, interruptionBoundary)',
  'partialTableCount !== "3"',
  'partialMarker !== "0"',
  'true-partial-DDL'
)) {
  if (-not $migrationGateText.Contains($required)) {
    throw "migration Gate lacks true partial-DDL evidence: $required"
  }
}

if ((Test-Path -LiteralPath 'backend/src/notification') -and -not $phase27bB1Authorized) {
  throw "Notification runtime is forbidden in Phase27A"
}
$publicEntryText = (Get-Content -Raw backend/src/app.ts) + "`n" + (Get-Content -Raw backend/src/server.ts)
if ($publicEntryText -match 'platformDelivery|platform_event') {
  throw "Phase27A must not register a public Platform Delivery API or auto-run entry"
}

$allowed = @(
  '^packages/types/src/',
  '^packages/validators/src/',
  '^backend/src/events/',
  '^db/migrations/054_phase27a_platform_delivery_foundation\.sql$',
  '^tests/(unit|contract|integration|security)/',
  '^scripts/(check-phase27a|run-phase27a)',
  '^scripts/check-phase24-completion-boundaries\.ps1$',
  '^scripts/check-phase25-closure\.mjs$',
  '^scripts/check-phase25-gate1(a|b)\.mjs$',
  '^docs/CURRENT_STATE\.md$',
  '^docs/reports/PHASE27A_PLATFORM_DELIVERY_(ENTRY|IMPLEMENTATION)_REPORT\.md$'
)
$statusLines = @(git status --porcelain=v1)
if (-not $phase27bB1Authorized) {
  foreach ($line in $statusLines) {
    $path = $line.Substring(3).Replace('\', '/')
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1] }
    if (-not ($allowed | Where-Object { $path -match $_ })) {
      throw "out-of-scope Phase27A path: $path"
    }
  }
}

Write-Output "check-phase27a-platform-delivery-boundaries: passed"
