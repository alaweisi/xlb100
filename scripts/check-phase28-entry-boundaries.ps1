$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
. (Join-Path $PSScriptRoot 'lib/current-state.ps1')

function Require-Contains {
  param([string]$Text, [string]$Needle, [string]$Label)
  if (-not $Text.Contains($Needle)) { throw "Phase28 entry evidence missing: $Label" }
}

$tagCommit = (git rev-parse 'xlb-phase27-notification-foundation^{}').Trim()
$mergeBase = (git merge-base HEAD 'xlb-phase27-notification-foundation^{}').Trim()
if ($LASTEXITCODE -ne 0 -or $tagCommit -ne $mergeBase) {
  throw "Phase28 branch must descend from the canonical Phase27 Lock tag"
}

$state = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/CURRENT_STATE.md'
$phase27 = Get-XlbPhaseTableEntry -CurrentStateText $state -PhaseId 'Phase 27'
$null = Assert-XlbPhaseStatusIn -Entry $phase27 -AllowedStatuses @('LOCKED')
$null = Assert-XlbPhase14ProductionBlocked -CurrentStateText $state

$phase29EntryPath = 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29ArchitecturePath = 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29ContractPath = 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29RegistryPath = 'docs/governance/phase-registry.json'
$phase29Authorized =
  ($state.Contains('Marketing / Coupon MVP (IN PROGRESS)') -or
   $state.Contains('Marketing / Coupon MVP (LOCKED)')) -and
  $state.Contains('approved Entry decisions D01') -and
  $state.Contains('D24 and authorized continuous Phase29 construction through independent acceptance.') -and
  $state.Contains('migration `057` only') -and
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

$requiredDocs = @(
  'docs/architecture/28_XLB_REVIEW_REPUTATION.md',
  'docs/contracts/CONTRACT_REVIEW_REPUTATION.md',
  'docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md',
  'docs/reports/PHASE28_REVIEW_REPUTATION_ENTRY_REPORT.md'
)
foreach ($doc in $requiredDocs) {
  if (-not (Test-Path -LiteralPath $doc)) { throw "Phase28 entry document missing: $doc" }
}

$decision = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/reports/PHASE28_REVIEW_REPUTATION_RUNTIME_DECISION_REPORT.md'
foreach ($required in @(
  'HUMAN APPROVED',
  'pending_moderation',
  'one immutable writer',
  'Worker Reply deferred',
  'Dispatch may not read Reputation',
  'No automatic historical backfill',
  'review.created',
  'migration `056`'
)) {
  Require-Contains $decision $required $required
}

$architecture = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/architecture/28_XLB_REVIEW_REPUTATION.md'
foreach ($required in @(
  'ownership-before-idempotency',
  'event_major_version',
  'Phase14 remains `64/100`',
  'No Phase29 code or migration'
)) {
  Require-Contains $architecture $required $required
}

$contract = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/contracts/CONTRACT_REVIEW_REPUTATION.md'
foreach ($required in @(
  'comment',
  'customerId',
  'event_major_version=1',
  'exactly seven payload fields',
  '`decisionId`',
  '`reasonCode`',
  '`cityCode`',
  '/api/worker/review-appeal-targets',
  '/api/worker/reputation',
  '/api/admin/reviews/{reviewId}/content',
  'moderation_detail',
  'at most 100 items',
  'exactly five fields',
  'There is no Customer/public Reputation endpoint',
  'There is no Customer/public Reputation endpoint and no Dispatch endpoint'
)) {
  Require-Contains $contract $required $required
}

$lockedDiff = @(git diff --name-only 'xlb-phase27-notification-foundation^{}' -- db/migrations | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -le 55
})
if ($lockedDiff.Count -ne 0) {
  throw "Phase28 must not modify locked migration(s): $($lockedDiff -join ', ')"
}

$laterMigrations = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 56
})
$expectedPhase28Migrations = @('056_phase28_review_reputation.sql')
if ($phase29Authorized) { $expectedPhase28Migrations += '057_phase29_marketing_coupon.sql' }
if (Test-Path -LiteralPath 'db/migrations/058_stage2c2_migration_control.sql') {
  $expectedPhase28Migrations += '058_stage2c2_migration_control.sql'
}
$tkeCosMigrationPath = 'db/migrations/059_tke_cos_object_storage.sql'
$tkeCosSourceCommit = '8c28d81fc81c84805368c969c590a77bf2a95b91'
if (Test-Path -LiteralPath $tkeCosMigrationPath) {
  $tkeCosHash = (git hash-object -- $tkeCosMigrationPath).Trim()
  $lockedTkeCosHash = (git rev-parse "${tkeCosSourceCommit}:$tkeCosMigrationPath" 2>$null).Trim()
  if ($LASTEXITCODE -eq 0 -and $tkeCosHash -eq $lockedTkeCosHash) {
    $expectedPhase28Migrations += '059_tke_cos_object_storage.sql'
  }
}
$actualMigrationNames = @($laterMigrations.Name | Sort-Object) -join ','
$expectedMigrationNames = @($expectedPhase28Migrations | Sort-Object) -join ','
if ($laterMigrations.Count -ne $expectedPhase28Migrations.Count -or
    $actualMigrationNames -ne $expectedMigrationNames) {
  throw "Phase28 entry permits only the exact authorized migration chain through the active formal Phase"
}
$migration056Path = 'db/migrations/056_phase28_review_reputation.sql'
$migration056Hash = (git hash-object -- $migration056Path).Trim()
$lockedMigration056Hash = (git rev-parse "xlb-phase28-review-reputation^{}:$migration056Path").Trim()
if ($LASTEXITCODE -ne 0 -or $migration056Hash -ne $lockedMigration056Hash) {
  throw "locked migration 056 hash differs from the canonical Phase28 tag"
}

Write-Output "check-phase28-entry-boundaries: passed"
