$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

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
Require-Contains $state 'Phase 27 | LOCKED' 'Phase27 LOCKED truth'
Require-Contains $state 'Phase 14 | IN PROGRESS' 'Phase14 IN PROGRESS truth'
Require-Contains $state '64/100' 'Phase14 readiness score'
Require-Contains $state 'staging/production `NO-GO`' 'production NO-GO truth'

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
if ($laterMigrations.Count -gt 1) { throw "Phase28 permits only one migration at 056" }
if ($laterMigrations.Count -eq 1 -and $laterMigrations[0].Name -ne '056_phase28_review_reputation.sql') {
  throw "Phase28 migration must be exactly 056_phase28_review_reputation.sql"
}

Write-Output "check-phase28-entry-boundaries: passed"
