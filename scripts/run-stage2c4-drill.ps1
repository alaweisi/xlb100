[CmdletBinding()]
param(
  [ValidateSet('local', 'staging')][string]$Environment = 'local',
  [string]$MysqlContainer = '',
  [string]$RedisContainer = '',
  [string]$Database = '',
  [string]$MysqlUser = 'xlb',
  [string]$MysqlPassword = '',
  [string]$AdminPassword = '',
  [int]$MaxBackupSeconds = 900,
  [int]$MaxRestoreSeconds = 1800,
  [switch]$KeepBackupArtifact
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupScript = Join-Path $Root 'deploy\backup\backup-db.ps1'
$restoreScript = Join-Path $Root 'deploy\backup\restore-db.ps1'
$capacityScript = Join-Path $Root 'deploy\backup\measure-capacity.ps1'
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$artifactDirectory = Join-Path $Root '.artifacts\stage2c4'
[IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null

if (-not $MysqlContainer) { $MysqlContainer = if ($Environment -eq 'local') { 'xlb-mysql-local' } else { 'xlb-mysql-staging' } }
if (-not $RedisContainer) { $RedisContainer = if ($Environment -eq 'local') { 'xlb-redis-local' } else { 'xlb-redis-staging' } }
if (-not $Database) { $Database = if ($Environment -eq 'local') { 'xlb_local' } else { 'xlb_staging' } }
if (-not $MysqlPassword) {
  if ($Environment -eq 'local') { $MysqlPassword = 'xlb_local_password' }
  elseif ($env:MYSQL_PASSWORD) { $MysqlPassword = $env:MYSQL_PASSWORD }
  else { throw 'staging drill requires -MysqlPassword or MYSQL_PASSWORD' }
}
if (-not $AdminPassword) {
  if ($Environment -eq 'local') { $AdminPassword = 'xlb_root_password' }
  elseif ($env:MYSQL_PASSWORD) { $AdminPassword = $env:MYSQL_PASSWORD }
  else { throw 'staging drill requires -AdminPassword or MYSQL_PASSWORD' }
}

$backupPath = Join-Path $artifactDirectory "$Environment-$Database-$stamp.sql"
$restoreEvidencePath = Join-Path $artifactDirectory "restore-$Environment-$stamp.json"
$capacityEvidencePath = Join-Path $artifactDirectory "capacity-$Environment-$stamp.json"
$summaryPath = Join-Path $artifactDirectory "drill-$Environment-$stamp.json"
$targetDatabase = "xlb_restore_drill_$($stamp.Replace('-', '').Replace('T', '_').Replace('Z', ''))"

try {
  & $backupScript -Environment $Environment -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -ArtifactPath $backupPath
  if ($LASTEXITCODE -ne 0) { throw 'Stage 2C-4 backup failed' }
  & $restoreScript -Environment $Environment -Container $MysqlContainer -AdminPassword $AdminPassword -BackupPath $backupPath -TargetDatabase $targetDatabase -EvidencePath $restoreEvidencePath -ConfirmIsolatedRestore
  if ($LASTEXITCODE -ne 0) { throw 'Stage 2C-4 restore failed' }
  & $capacityScript -Environment $Environment -MysqlContainer $MysqlContainer -RedisContainer $RedisContainer -Database $Database -MysqlUser $MysqlUser -MysqlPassword $MysqlPassword -OutputPath $capacityEvidencePath -FailOnStorageEnvelope
  if ($LASTEXITCODE -ne 0) { throw 'Stage 2C-4 capacity envelope failed' }

  $backupManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath "$backupPath.manifest.json" | ConvertFrom-Json
  $restoreEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $restoreEvidencePath | ConvertFrom-Json
  $capacityEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $capacityEvidencePath | ConvertFrom-Json
  $previousPassword = $env:MYSQL_PWD
  try {
    $env:MYSQL_PWD = $MysqlPassword
    $binlogRaw = @(& docker exec -e MYSQL_PWD $MysqlContainer mysql --batch --skip-column-names "-u$MysqlUser" -e 'SELECT @@log_bin,@@binlog_format,@@binlog_expire_logs_seconds' 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "MySQL binlog readiness query failed: $($binlogRaw -join ' ')" }
  } finally {
    $env:MYSQL_PWD = $previousPassword
  }
  $binlogParts = "$($binlogRaw[0])" -split '\s+'
  $redisPersistence = @(& docker exec $RedisContainer redis-cli --raw CONFIG GET appendonly 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Redis persistence query failed: $($redisPersistence -join ' ')" }
  $backupWithinRto = [double]$backupManifest.durationSeconds -le $MaxBackupSeconds
  $restoreWithinRto = [double]$restoreEvidence.durationSeconds -le $MaxRestoreSeconds
  $drillPassed = $backupWithinRto -and $restoreWithinRto -and $capacityEvidence.storageWithinEnvelope
  [ordered]@{
    schemaVersion = 1
    drill = 'stage2c4-isolated-backup-restore-capacity'
    observedAt = [DateTimeOffset]::UtcNow.ToString('o')
    environment = $Environment
    sourceDatabase = $Database
    restoreTarget = $targetDatabase
    restoreTargetCleaned = $true
    backup = [ordered]@{
      seconds = [double]$backupManifest.durationSeconds
      maxSeconds = $MaxBackupSeconds
      bytes = [long]$backupManifest.bytes
      sha256 = $backupManifest.sha256
      passed = $backupWithinRto
    }
    restore = [ordered]@{
      seconds = [double]$restoreEvidence.durationSeconds
      maxSeconds = $MaxRestoreSeconds
      latestMigration = $restoreEvidence.latestMigration
      duplicateLedgerEntries = $restoreEvidence.duplicateLedgerEntries
      passed = $restoreWithinRto
    }
    capacity = $capacityEvidence
    mysqlRecovery = [ordered]@{
      logBin = if ($binlogParts.Count -gt 0) { $binlogParts[0] } else { 'UNKNOWN' }
      binlogFormat = if ($binlogParts.Count -gt 1) { $binlogParts[1] } else { 'UNKNOWN' }
      binlogExpireSeconds = if ($binlogParts.Count -gt 2) { $binlogParts[2] } else { 'UNKNOWN' }
      pitrScheduledAndProven = $false
    }
    redis = [ordered]@{
      appendonly = if ($redisPersistence.Count -gt 1) { "$($redisPersistence[1])" } else { 'unknown' }
      recoverySource = 'authoritative MySQL dispatch state via idempotent runId rebuild'
    }
    productionReady = $false
    productionBlockers = @('approved backup schedule', 'verified binlog shipping/PITR', 'production restore owner and drill')
    result = if ($drillPassed) { 'PASS_LOCAL_OR_STAGING_DRILL' } else { 'FAIL' }
  } | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -LiteralPath $summaryPath
  Write-Output "STAGE2C4_DRILL_EVIDENCE=$summaryPath"
  if (-not $drillPassed) { throw 'Stage 2C-4 drill exceeded an acceptance threshold' }
} finally {
  if (-not $KeepBackupArtifact) {
    Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $backupPath
  }
}
