[CmdletBinding()]
param(
  [string]$Container = 'xlb-mysql-local',
  [string]$HostName = '127.0.0.1',
  [int]$Port = 3306,
  [string]$AdminUser = 'root',
  [string]$AdminPassword = 'xlb_root_password',
  [string]$TargetDatabase = '',
  [string]$EvidencePath = '',
  [switch]$ConfirmIsolatedMigrationReplay,
  [switch]$KeepTarget
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $Root 'deploy\backup\common.ps1')

if (-not $ConfirmIsolatedMigrationReplay) {
  throw 'migration replay requires -ConfirmIsolatedMigrationReplay'
}
if ($Port -lt 1 -or $Port -gt 65535) { throw 'MySQL port is invalid' }
Assert-SafeContainerName $Container
Assert-SafeDatabaseIdentifier $AdminUser 'database admin user'
Assert-DockerContainerRunning $Container

$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
if (-not $TargetDatabase) {
  $TargetDatabase = "xlb_stage4a_migration_$($stamp.Replace('-', '').Replace('T', '_').Replace('Z', ''))"
}
Assert-SafeDatabaseIdentifier $TargetDatabase 'migration replay target'
if ($TargetDatabase -notmatch '^xlb_stage4a_migration_[A-Za-z0-9_]{1,38}$') {
  throw 'migration replay target must use the isolated xlb_stage4a_migration_* prefix'
}
if (-not $EvidencePath) {
  $EvidencePath = Join-Path $Root ".artifacts\stage4a\migration-replay-$stamp.json"
}
$evidence = [IO.Path]::GetFullPath($EvidencePath)
[IO.Directory]::CreateDirectory((Split-Path -Parent $evidence)) | Out-Null

$migrationFiles = @(Get-ChildItem -LiteralPath (Join-Path $Root 'db\migrations') -Filter '*.sql' -File | Sort-Object Name)
if ($migrationFiles.Count -eq 0) { throw 'no migration files were found' }
$candidateMigrationCount = $migrationFiles.Count
$candidateLatestMigration = $migrationFiles[-1].BaseName
$managedEnv = @('NODE_ENV', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD')
$previousEnv = @{}
foreach ($key in $managedEnv) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key) }

function Invoke-CanonicalMigration {
  Push-Location $Root
  try {
    $output = @(& pnpm.cmd run db:migrate 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $text = ($output -join "`n").Trim()
  if ($exitCode -ne 0) { throw "canonical migration CLI failed: $text" }
  return $text
}

$created = $false
$succeeded = $false
$startedAt = [DateTimeOffset]::UtcNow
try {
  Invoke-DockerText -MysqlPassword $AdminPassword -Arguments @(
    'exec', '-e', 'MYSQL_PWD', $Container,
    'mysql', "-u$AdminUser", '-e',
    "CREATE DATABASE $TargetDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  ) | Out-Null
  $created = $true

  $env:NODE_ENV = 'development'
  $env:MYSQL_HOST = $HostName
  $env:MYSQL_PORT = "$Port"
  $env:MYSQL_DATABASE = $TargetDatabase
  $env:MYSQL_USER = $AdminUser
  $env:MYSQL_PASSWORD = $AdminPassword

  $firstOutput = Invoke-CanonicalMigration
  $appliedCount = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT COUNT(*) FROM schema_migrations')
  $distinctCount = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT COUNT(DISTINCT version) FROM schema_migrations')
  $missingChecksums = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql "SELECT COUNT(*) FROM schema_migrations WHERE checksum_sha256 IS NULL OR checksum_sha256='' ")
  $appliedLatestMigration = Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1'
  $baseTableCount = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'")
  $failedHistory = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql "SELECT COUNT(*) FROM migration_execution_history WHERE status='failed'")

  if ($appliedCount -ne $candidateMigrationCount) {
    throw "applied migration count mismatch: expected $candidateMigrationCount, actual $appliedCount"
  }
  if ($distinctCount -ne $candidateMigrationCount) { throw 'migration versions are not unique' }
  if ($missingChecksums -ne 0) { throw 'one or more applied migrations have no checksum' }
  if ($appliedLatestMigration -ne $candidateLatestMigration) {
    throw "latest migration mismatch: expected $candidateLatestMigration, actual $appliedLatestMigration"
  }
  if ($baseTableCount -lt 1) { throw 'migration replay created no base tables' }
  if ($failedHistory -ne 0) { throw 'migration replay recorded a failed execution' }

  $secondOutput = Invoke-CanonicalMigration
  if ($secondOutput -notmatch '(?s)"applied"\s*:\s*\[\s*\]') {
    throw 'second canonical migration run was not idempotent'
  }
  $countAfterSecondRun = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT COUNT(*) FROM schema_migrations')
  if ($countAfterSecondRun -ne $appliedCount) { throw 'second migration run changed the applied version count' }

  $completedAt = [DateTimeOffset]::UtcNow
  [ordered]@{
    schemaVersion = 1
    drill = 'stage4a-isolated-full-migration-replay'
    startedAt = $startedAt.ToString('o')
    completedAt = $completedAt.ToString('o')
    durationSeconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    targetContainer = $Container
    targetDatabase = $TargetDatabase
    candidateMigrationCount = $candidateMigrationCount
    appliedMigrationCount = $appliedCount
    distinctMigrationCount = $distinctCount
    missingChecksums = $missingChecksums
    latestMigration = $appliedLatestMigration
    baseTableCount = $baseTableCount
    failedExecutionHistoryRows = $failedHistory
    secondRunAppliedNothing = $true
    targetCleanup = if ($KeepTarget) { 'retained for the parent Stage 4A isolated test run' } else { 'dropped in finally' }
    productionReady = $false
    result = 'PASS_LOCAL_MIGRATION_REPLAY'
  } | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $evidence
  $succeeded = $true
  Write-Output "STAGE4A_MIGRATION_EVIDENCE=$evidence"
  Write-Output "STAGE4A_MIGRATION_DATABASE=$TargetDatabase"
} finally {
  foreach ($key in $managedEnv) {
    [Environment]::SetEnvironmentVariable($key, $previousEnv[$key])
  }
  if ($created -and (-not $KeepTarget -or -not $succeeded)) {
    Invoke-DockerText -MysqlPassword $AdminPassword -Arguments @(
      'exec', '-e', 'MYSQL_PWD', $Container,
      'mysql', "-u$AdminUser", '-e', "DROP DATABASE IF EXISTS $TargetDatabase"
    ) | Out-Null
  }
}
