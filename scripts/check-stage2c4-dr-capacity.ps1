$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$required = @(
  'deploy/backup/common.ps1',
  'deploy/backup/backup-db.ps1',
  'deploy/backup/restore-db.ps1',
  'deploy/backup/measure-capacity.ps1',
  'scripts/run-stage2c4-drill.ps1',
  'docs/release/STAGE2C4_DR_CAPACITY_RUNBOOK.md'
)
foreach ($relative in $required) {
  $path = Join-Path $Root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "missing Stage 2C-4 artifact: $relative" }
  $tokens = $null
  $errors = $null
  [Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors) | Out-Null
  if ($relative.EndsWith('.ps1') -and $errors.Count -gt 0) {
    throw "PowerShell parse error in ${relative}: $($errors[0].Message)"
  }
}
$backup = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'deploy/backup/backup-db.ps1')
$restore = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'deploy/backup/restore-db.ps1')
$capacity = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'deploy/backup/measure-capacity.ps1')
$runner = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'scripts/run-stage2c4-drill.ps1')
foreach ($needle in @('--single-transaction', '--set-gtid-purged=OFF', 'sha256', 'criticalTableCounts')) {
  if (-not $backup.Contains($needle)) { throw "backup gate missing: $needle" }
}
foreach ($needle in @('ConfirmIsolatedRestore', 'xlb_restore_drill_', 'duplicateLedgerEntries', 'DROP DATABASE IF EXISTS')) {
  if (-not $restore.Contains($needle)) { throw "restore safety gate missing: $needle" }
}
foreach ($needle in @('MaxOutboxRows', 'MaxOutboxBytes', 'MaxRedisStreamLength', 'oldestEligibleAgeSeconds')) {
  if (-not $capacity.Contains($needle)) { throw "capacity gate missing: $needle" }
}
foreach ($needle in @('pitrScheduledAndProven = $false', 'productionReady = $false', 'MaxBackupSeconds', 'MaxRestoreSeconds')) {
  if (-not $runner.Contains($needle)) { throw "drill truthfulness gate missing: $needle" }
}
Write-Output 'check-stage2c4-dr-capacity: passed'
