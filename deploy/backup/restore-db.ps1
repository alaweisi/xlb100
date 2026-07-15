[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupPath,
  [string]$ManifestPath = '',
  [Parameter(Mandatory)][string]$TargetDatabase,
  [ValidateSet('local', 'staging')][string]$Environment = 'local',
  [string]$Container = '',
  [string]$AdminUser = 'root',
  [string]$AdminPassword = '',
  [string]$EvidencePath = '',
  [switch]$ConfirmIsolatedRestore,
  [switch]$KeepTarget
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $ConfirmIsolatedRestore) { throw 'restore requires -ConfirmIsolatedRestore' }
Assert-SafeDatabaseIdentifier $TargetDatabase 'restore target database'
Assert-SafeDatabaseIdentifier $AdminUser 'database admin user'
if ($TargetDatabase -notmatch '^xlb_restore_drill_[A-Za-z0-9_]{1,44}$') {
  throw 'restore target must use the isolated xlb_restore_drill_* prefix'
}
if (-not $Container) { $Container = if ($Environment -eq 'local') { 'xlb-mysql-local' } else { 'xlb-mysql-staging' } }
if (-not $AdminPassword) {
  if ($Environment -eq 'local') { $AdminPassword = 'xlb_root_password' }
  elseif ($env:MYSQL_PASSWORD) { $AdminPassword = $env:MYSQL_PASSWORD }
  else { throw 'staging restore requires -AdminPassword or MYSQL_PASSWORD' }
}
Assert-DockerContainerRunning $Container
$backup = (Resolve-Path -LiteralPath $BackupPath).Path
if (-not $ManifestPath) { $ManifestPath = "$backup.manifest.json" }
$manifestFile = (Resolve-Path -LiteralPath $ManifestPath).Path
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestFile | ConvertFrom-Json
if ($manifest.sourceDatabase -eq $TargetDatabase) { throw 'restore target must differ from source database' }
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash
if ($actualHash -ne $manifest.sha256) { throw 'backup SHA-256 does not match manifest' }
if (-not $EvidencePath) { $EvidencePath = "$backup.restore.json" }
$evidence = [IO.Path]::GetFullPath($EvidencePath)
[IO.Directory]::CreateDirectory((Split-Path -Parent $evidence)) | Out-Null

$created = $false
$startedAt = [DateTimeOffset]::UtcNow
try {
  Invoke-DockerText -MysqlPassword $AdminPassword -Arguments @(
    'exec', '-e', 'MYSQL_PWD', $Container,
    'mysql', '--batch', '--skip-column-names', "-u$AdminUser", '-e',
    "DROP DATABASE IF EXISTS $TargetDatabase; CREATE DATABASE $TargetDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  ) | Out-Null
  $created = $true
  Invoke-DockerRedirect -MysqlPassword $AdminPassword -StandardInputPath $backup -Arguments @(
    'exec', '-i', '-e', 'MYSQL_PWD', $Container,
    'mysql', '--default-character-set=utf8mb4', "-u$AdminUser", $TargetDatabase
  )

  $restoredCounts = [ordered]@{}
  foreach ($property in $manifest.criticalTableCounts.PSObject.Properties) {
    $table = $property.Name
    if ($table -notmatch '^[a-z][a-z0-9_]{0,63}$') { throw "invalid manifest table name: $table" }
    $actual = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql "SELECT COUNT(*) FROM $table")
    $expected = [long]$property.Value
    if ($actual -ne $expected) { throw "restored row count mismatch for ${table}: expected $expected, actual $actual" }
    $restoredCounts[$table] = $actual
  }
  $latestMigration = Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1'
  if ($latestMigration -ne $manifest.latestMigration) {
    throw "restored latest migration mismatch: expected $($manifest.latestMigration), actual $latestMigration"
  }
  $duplicateLedgerEntries = [long](Invoke-MysqlScalar -Container $Container -Database $TargetDatabase -User $AdminUser -Password $AdminPassword -Sql 'SELECT COUNT(*) FROM (SELECT account_id,source_type,source_id,direction,COUNT(*) c FROM ledger_entries GROUP BY account_id,source_type,source_id,direction HAVING c>1) duplicates')
  if ($duplicateLedgerEntries -ne 0) { throw 'restored ledger contains duplicate entry keys' }

  $completedAt = [DateTimeOffset]::UtcNow
  [ordered]@{
    schemaVersion = 1
    sourceArtifact = [IO.Path]::GetFileName($backup)
    sourceSha256 = $actualHash
    targetContainer = $Container
    targetDatabase = $TargetDatabase
    startedAt = $startedAt.ToString('o')
    completedAt = $completedAt.ToString('o')
    durationSeconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    latestMigration = $latestMigration
    criticalTableCounts = $restoredCounts
    duplicateLedgerEntries = $duplicateLedgerEntries
    targetCleanup = if ($KeepTarget) { 'retained by explicit operator switch' } else { 'dropped in finally' }
    result = 'PASS'
  } | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $evidence
  Write-Output "RESTORE_EVIDENCE=$evidence"
} finally {
  if ($created -and -not $KeepTarget) {
    Invoke-DockerText -MysqlPassword $AdminPassword -Arguments @(
      'exec', '-e', 'MYSQL_PWD', $Container,
      'mysql', "-u$AdminUser", '-e', "DROP DATABASE IF EXISTS $TargetDatabase"
    ) | Out-Null
  }
}
