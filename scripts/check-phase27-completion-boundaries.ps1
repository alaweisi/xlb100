$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$currentState = Get-Content -Raw -LiteralPath 'docs/CURRENT_STATE.md'
if (-not ($currentState.Contains('Phase 27 | PHASE27E EXIT VERIFICATION') -or
          $currentState.Contains('Phase 27 | LOCKED'))) {
  throw "Phase27 completion Gate requires Phase27E exit verification or final Lock state"
}
if (-not $currentState.Contains('Phase 14 | IN PROGRESS') -or
    -not $currentState.Contains('64/100') -or
    -not $currentState.Contains('staging/production `NO-GO`')) {
  throw "Phase27 must preserve the Phase14 64/100 staging/production NO-GO truth"
}

$migrations = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 54
})
$expectedMigrations = @(
  '054_phase27a_platform_delivery_foundation.sql',
  '055_phase27b_notification_projection_foundation.sql'
)
$phase28DecisionPath = 'docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md'
$phase28Authorized =
  $currentState.Contains('Phase 27 | LOCKED') -and
  (Test-Path -LiteralPath $phase28DecisionPath) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase28DecisionPath).Contains('HUMAN APPROVED')
if ($phase28Authorized) {
  $expectedMigrations += '056_phase28_review_reputation.sql'
}
if ($migrations.Count -ne $expectedMigrations.Count) {
  throw "Phase27 completion migration ledger contains an unauthorized 054+ migration"
}
foreach ($expected in $expectedMigrations) {
  if ($migrations.Name -notcontains $expected) { throw "Phase27 migration missing: $expected" }
}

foreach ($gate in @(
  'check-phase27a-platform-delivery-boundaries.ps1',
  'check-phase27b-notification-projection-boundaries.ps1',
  'check-phase27b-b2-notification-runtime-boundaries.ps1',
  'check-phase27c-notification-api-boundaries.ps1',
  'check-phase27d-notification-ui-boundaries.ps1'
)) {
  & (Join-Path $PSScriptRoot $gate)
  if ($LASTEXITCODE -ne 0) { throw "Phase27 sub-Gate failed: $gate" }
}

foreach ($report in @(
  'docs/reports/PHASE27A_PLATFORM_DELIVERY_IMPLEMENTATION_REPORT.md',
  'docs/reports/PHASE27B_NOTIFICATION_PROJECTION_IMPLEMENTATION_REPORT.md',
  'docs/reports/PHASE27B_B2_NOTIFICATION_RUNTIME_DECISION_REPORT.md',
  'docs/reports/PHASE27C_NOTIFICATION_API_IMPLEMENTATION_REPORT.md',
  'docs/reports/PHASE27D_NOTIFICATION_UI_IMPLEMENTATION_REPORT.md'
)) {
  if (-not (Test-Path -LiteralPath $report)) { throw "Phase27 evidence report missing: $report" }
}

$migration055 = Get-Content -Raw -LiteralPath 'db/migrations/055_phase27b_notification_projection_foundation.sql'
$dataInserts = [regex]::Matches($migration055, '(?im)^\s*INSERT\s+INTO\s+([a-z0-9_]+)')
if ($dataInserts.Count -ne 1 -or $dataInserts[0].Groups[1].Value -ne 'schema_migrations') {
  throw "Phase27 Lock forbids Notification seed, template, subscriber or activation data"
}
$seedText = (Get-ChildItem db/seed -File -ErrorAction SilentlyContinue | ForEach-Object {
  Get-Content -Raw -LiteralPath $_.FullName
}) -join "`n"
if ($seedText -match '(?i)notification_(templates|template_revisions|records|recipient_states)|platform_event_subscribers') {
  throw "Phase27 Lock forbids Notification or Platform subscriber seed activation"
}

$notificationRuntime = (Get-ChildItem backend/src/notification -File -Filter '*.ts' | ForEach-Object {
  Get-Content -Raw -LiteralPath $_.FullName
}) -join "`n"
if ($notificationRuntime -match '(?is)(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?(orders|payment_orders|dispatch_tasks|ledger_entries|support_tickets|event_outbox|platform_event_)') {
  throw "Phase27 Notification contains a source or protected-domain write"
}
if ($notificationRuntime -match '(?i)\b(sms|wechat|email|external.?channel|provider.?client|physical.?delete|purge)\b') {
  throw "Phase27 Lock forbids external Provider and physical deletion capability"
}

$appEntry = (Get-Content -Raw -LiteralPath 'backend/src/app.ts') + "`n" +
  (Get-Content -Raw -LiteralPath 'backend/src/server.ts')
if ($appEntry -match 'NotificationProjectionWorker|notificationProjectionWorker') {
  throw "Phase27 B2 internal worker must remain explicitly driven, not auto-run"
}

Write-Output "check-phase27-completion-boundaries: passed"
