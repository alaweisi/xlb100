[CmdletBinding()]
param(
  [ValidateSet('local', 'staging')][string]$Environment = 'local',
  [string]$Container = '',
  [string]$Database = '',
  [string]$User = 'xlb',
  [string]$Password = '',
  [string]$ArtifactPath = '',
  [switch]$ConfirmWritersQuiesced
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not $Container) { $Container = if ($Environment -eq 'local') { 'xlb-mysql-local' } else { 'xlb-mysql-staging' } }
if (-not $Database) { $Database = if ($Environment -eq 'local') { 'xlb_local' } else { 'xlb_staging' } }
if (-not $Password) {
  if ($Environment -eq 'local') { $Password = 'xlb_local_password' }
  elseif ($env:MYSQL_PASSWORD) { $Password = $env:MYSQL_PASSWORD }
  else { throw 'staging backup requires -Password or MYSQL_PASSWORD' }
}
if (-not $ArtifactPath) {
  $stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
  $ArtifactPath = Join-Path $Root ".artifacts\stage2c4\$Environment-$Database-$stamp.sql"
}

Assert-SafeDatabaseIdentifier $Database 'source database'
Assert-SafeDatabaseIdentifier $User 'database user'
Assert-SafeContainerName $Container
Assert-DockerContainerRunning $Container
$artifact = [IO.Path]::GetFullPath($ArtifactPath)
$artifactDirectory = Split-Path -Parent $artifact
[IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null
$manifestPath = "$artifact.manifest.json"

$criticalTables = @(
  'schema_migrations', 'orders', 'payment_orders', 'event_outbox',
  'dispatch_tasks', 'ledger_entries', 'ledger_accruals', 'settlement_batches'
)
$startedAt = [DateTimeOffset]::UtcNow
try {
  Invoke-DockerRedirect -MysqlPassword $Password -StandardOutputPath $artifact -Arguments @(
    'exec', '-e', 'MYSQL_PWD', $Container,
    'mysqldump', '--single-transaction', '--quick', '--hex-blob',
    '--set-gtid-purged=OFF', '--no-tablespaces', '--routines', '--triggers', '--events',
    '--default-character-set=utf8mb4', "-u$User", $Database
  )
  $file = Get-Item -LiteralPath $artifact
  if ($file.Length -lt 1024) { throw 'backup artifact is unexpectedly small' }
  $counts = [ordered]@{}
  foreach ($table in $criticalTables) {
    $counts[$table] = [long](Invoke-MysqlScalar -Container $Container -Database $Database -User $User -Password $Password -Sql "SELECT COUNT(*) FROM $table")
  }
  $latestMigration = Invoke-MysqlScalar -Container $Container -Database $Database -User $User -Password $Password -Sql 'SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1'
  $completedAt = [DateTimeOffset]::UtcNow
  $manifest = [ordered]@{
    schemaVersion = 1
    environment = $Environment
    sourceContainer = $Container
    sourceDatabase = $Database
    startedAt = $startedAt.ToString('o')
    completedAt = $completedAt.ToString('o')
    durationSeconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    artifactFile = [IO.Path]::GetFileName($artifact)
    bytes = $file.Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash
    latestMigration = $latestMigration
    criticalTableCounts = $counts
    sourceWritersQuiesced = [bool]$ConfirmWritersQuiesced
    countVerificationMode = if ($ConfirmWritersQuiesced) { 'exact_source_counts' } else { 'record_nonquiesced_drift' }
    consistency = if ($ConfirmWritersQuiesced) {
      'mysqldump --single-transaction with operator-confirmed writer quiescence; exact count comparison required'
    } else {
      'mysqldump --single-transaction snapshot; post-dump source counts are observational and may drift under concurrent writes'
    }
  }
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $manifestPath
  Write-Output "BACKUP_PATH=$artifact"
  Write-Output "BACKUP_MANIFEST=$manifestPath"
} catch {
  Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $artifact, $manifestPath
  throw
}
