$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Read-FileAtRef([string]$Ref, [string]$Path) {
  $content = @(git show "${Ref}:$Path")
  if ($LASTEXITCODE -ne 0) {
    throw "Phase29 entry artifact missing at ${Ref}: $Path"
  }
  return $content -join "`n"
}

function Require-Contains([string]$Text, [string]$Needle, [string]$Label) {
  if (-not $Text.Contains($Needle)) {
    throw "Phase29 entry evidence missing: $Label"
  }
}

$phase28Tag = 'xlb-phase28-review-reputation'
$phase29Tag = 'xlb-phase29-marketing-coupon'
foreach ($tag in @($phase28Tag, $phase29Tag)) {
  git rev-parse --verify "$tag^{}" *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Phase29 requires immutable tag $tag"
  }
}
$phase28Commit = (git rev-list -n 1 $phase28Tag).Trim()
$phase29Commit = (git rev-list -n 1 $phase29Tag).Trim()
$phase29MergeBase = (git merge-base $phase29Commit $phase28Commit).Trim()
if ($LASTEXITCODE -ne 0 -or $phase29MergeBase -ne $phase28Commit) {
  throw "Phase29 tag must descend from the canonical Phase28 predecessor $phase28Commit; merge-base was $phase29MergeBase"
}
$headMergeBase = (git merge-base HEAD $phase29Commit).Trim()
if ($LASTEXITCODE -ne 0 -or $headMergeBase -ne $phase29Commit) {
  throw "Current HEAD must descend from the canonical Phase29 tag $phase29Commit; merge-base was $headMergeBase"
}

$paths = @(
  'docs/CURRENT_STATE.md',
  'docs/governance/phase-registry.json',
  'docs/architecture/29_XLB_MARKETING_COUPON.md',
  'docs/contracts/CONTRACT_MARKETING_COUPON.md',
  'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
)

$artifacts = @{}
$paths | ForEach-Object { $artifacts[$_] = Read-FileAtRef $phase29Commit $_ }
$state = $artifacts['docs/CURRENT_STATE.md']
$architecture = $artifacts['docs/architecture/29_XLB_MARKETING_COUPON.md']
$contract = $artifacts['docs/contracts/CONTRACT_MARKETING_COUPON.md']
$report = $artifacts['docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md']
$registry = $artifacts['docs/governance/phase-registry.json'] | ConvertFrom-Json

foreach ($required in @(
  'Marketing / Coupon MVP',
  'D01',
  'D24',
  'MarketingCampaign',
  'fixed-amount coupon',
  'migration `057` only',
  'Campaign.discountRuleId',
  'production activation remains prohibited'
)) {
  Require-Contains $state $required $required
}

$phase29 = @($registry.phases | Where-Object { $_.id -eq 'Phase 29' })
if ($phase29.Count -ne 1 -or $phase29[0].status -notin @('IN_PROGRESS', 'LOCKED')) {
  throw 'governance registry must contain exactly one IN_PROGRESS or LOCKED Phase 29 entry'
}
if ($registry.lastLockedPhase -notin @('Phase 28', 'Phase 29')) {
  throw 'Phase29 Gate requires Phase 28 as predecessor or Phase 29 as the post-Lock state'
}

$entryEvidence = "$architecture`n$contract`n$report"
foreach ($required in @(
  'MarketingCampaign',
  'Coupon',
  'DiscountDecision',
  'city_code',
  'CNY',
  'minor',
  'discountRuleId'
)) {
  Require-Contains $entryEvidence $required $required
}

foreach ($required in @(
  'multiple coupons',
  'partial refund',
  'payment failure',
  'production',
  'Provider',
  'backfill'
)) {
  if ($architecture -notmatch [regex]::Escape($required) -and $report -notmatch [regex]::Escape($required)) {
    throw "Phase29 entry boundary is not recorded: $required"
  }
}

$phase29MigrationChanges = @(git diff --name-only "$phase28Tag^{}" "$phase29Tag^{}" -- db/migrations)
$lockedMigrationChanges = @($phase29MigrationChanges | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -le 56
})
if ($lockedMigrationChanges.Count -gt 0) {
  throw "Phase29 must not modify locked migration(s): $($lockedMigrationChanges -join ', ')"
}

$postLockMigrationChanges = @(git diff --name-only "$phase29Tag^{}" -- db/migrations | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -le 57
})
if ($postLockMigrationChanges.Count -gt 0) {
  throw "Current worktree must not modify Phase29-locked migration(s): $($postLockMigrationChanges -join ', ')"
}

$phase29MigrationFiles = @(git ls-tree -r --name-only "$phase29Tag^{}" -- db/migrations)
$futureMigrations = @($phase29MigrationFiles | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -gt 57
})
if ($futureMigrations.Count -gt 0) {
  throw "Phase29 forbids migration 058 or later: $($futureMigrations -join ', ')"
}

$migration057 = @($phase29MigrationFiles | Where-Object { $_ -match '^db/migrations/057_' })
if ($migration057.Count -gt 1) {
  throw "Phase29 permits exactly one migration number 057; found $($migration057.Count)"
}
if ($migration057.Count -eq 1 -and $migration057[0] -ne 'db/migrations/057_phase29_marketing_coupon.sql') {
  throw "Phase29 migration must be named 057_phase29_marketing_coupon.sql"
}

Write-Output 'check-phase29-entry-boundaries: passed'
