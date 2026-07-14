$ErrorActionPreference = 'Stop'

Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))

function Require-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Phase29 entry artifact missing: $Path"
  }
}

function Require-Contains([string]$Text, [string]$Needle, [string]$Label) {
  if (-not $Text.Contains($Needle)) {
    throw "Phase29 entry evidence missing: $Label"
  }
}

$expectedBranch = 'codex/phase29-marketing-coupon'
$branch = (git branch --show-current).Trim()
if ($branch -ne $expectedBranch -and $branch -ne 'main') {
  throw "Phase29 Gate must run on $expectedBranch or post-merge main; found $branch"
}

$phase28Tag = 'xlb-phase28-review-reputation'
git rev-parse --verify "$phase28Tag^{}" *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Phase29 requires immutable predecessor tag $phase28Tag"
}
$phase28Commit = (git rev-list -n 1 $phase28Tag).Trim()
$mergeBase = (git merge-base HEAD $phase28Commit).Trim()
if ($LASTEXITCODE -ne 0 -or $mergeBase -ne $phase28Commit) {
  throw "Phase29 HEAD must descend from the canonical Phase28 predecessor $phase28Commit; merge-base was $mergeBase"
}

$paths = @(
  'docs/CURRENT_STATE.md',
  'docs/governance/phase-registry.json',
  'docs/architecture/29_XLB_MARKETING_COUPON.md',
  'docs/contracts/CONTRACT_MARKETING_COUPON.md',
  'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
)
$paths | ForEach-Object { Require-File $_ }

$state = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/CURRENT_STATE.md'
$architecture = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$contract = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$report = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$registry = Get-Content -Raw -Encoding UTF8 -LiteralPath 'docs/governance/phase-registry.json' | ConvertFrom-Json

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

$lockedMigrationChanges = @(git diff --name-only "$phase28Tag^{}" -- db/migrations | Where-Object {
  $_ -match '^db/migrations/(\d{3})_' -and [int]$Matches[1] -le 56
})
if ($lockedMigrationChanges.Count -gt 0) {
  throw "Phase29 must not modify locked migration(s): $($lockedMigrationChanges -join ', ')"
}

$futureMigrations = @(Get-ChildItem db/migrations -File | Where-Object {
  $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -gt 57
})
if ($futureMigrations.Count -gt 0) {
  throw "Phase29 forbids migration 058 or later: $($futureMigrations.Name -join ', ')"
}

$migration057 = @(Get-ChildItem db/migrations -File | Where-Object { $_.Name -match '^057_' })
if ($migration057.Count -gt 1) {
  throw "Phase29 permits exactly one migration number 057; found $($migration057.Count)"
}
if ($migration057.Count -eq 1 -and $migration057[0].Name -ne '057_phase29_marketing_coupon.sql') {
  throw "Phase29 migration must be named 057_phase29_marketing_coupon.sql"
}

Write-Output 'check-phase29-entry-boundaries: passed'
