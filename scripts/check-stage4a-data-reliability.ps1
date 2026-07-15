$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$required = @(
  'scripts/run-stage4a-migration-replay.ps1',
  'scripts/run-stage4a-data-reliability.ps1',
  'docs/release/STAGE4A_DATA_RELIABILITY_RUNBOOK.md'
)
foreach ($relative in $required) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "missing Stage 4A artifact: $relative" }
  if ($relative.EndsWith('.ps1')) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -gt 0) { throw "PowerShell parse error in ${relative}: $($errors[0].Message)" }
  }
}
$migration = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'scripts/run-stage4a-migration-replay.ps1')
$runner = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'scripts/run-stage4a-data-reliability.ps1')
foreach ($needle in @(
  'ConfirmIsolatedMigrationReplay',
  'xlb_stage4a_migration_',
  'missingChecksums',
  'secondRunAppliedNothing',
  'DROP DATABASE IF EXISTS'
)) {
  if (-not $migration.Contains($needle)) { throw "migration replay safety evidence is missing: $needle" }
}
foreach ($needle in @(
  '--label xlb.stage4a=true',
  'stage2c3RedisStreamReliability.test.ts',
  'outboxClaimConcurrency.test.ts',
  'run-stage2c4-drill.ps1',
  'realProviderUsed = $false',
  'productionReady = $false'
)) {
  if (-not $runner.Contains($needle)) { throw "Stage 4A orchestration evidence is missing: $needle" }
}
Write-Output 'check-stage4a-data-reliability: passed'
