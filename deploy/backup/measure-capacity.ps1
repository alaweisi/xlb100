[CmdletBinding()]
param(
  [ValidateSet('local', 'staging')][string]$Environment = 'local',
  [string]$MysqlContainer = '',
  [string]$RedisContainer = '',
  [string]$Database = '',
  [string]$MysqlUser = 'xlb',
  [string]$MysqlPassword = '',
  [string]$CityCode = 'hangzhou',
  [long]$MaxOutboxRows = 2000000,
  [long]$MaxOutboxBytes = 2147483648,
  [long]$MaxRedisStreamLength = 250000,
  [string]$OutputPath = '',
  [switch]$FailOnStorageEnvelope
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
. (Join-Path $PSScriptRoot 'common.ps1')

if ($CityCode -notmatch '^[a-z][a-z0-9-]{1,31}$') { throw 'city code is invalid' }
if (-not $MysqlContainer) { $MysqlContainer = if ($Environment -eq 'local') { 'xlb-mysql-local' } else { 'xlb-mysql-staging' } }
if (-not $RedisContainer) { $RedisContainer = if ($Environment -eq 'local') { 'xlb-redis-local' } else { 'xlb-redis-staging' } }
if (-not $Database) { $Database = if ($Environment -eq 'local') { 'xlb_local' } else { 'xlb_staging' } }
if (-not $MysqlPassword) {
  if ($Environment -eq 'local') { $MysqlPassword = 'xlb_local_password' }
  elseif ($env:MYSQL_PASSWORD) { $MysqlPassword = $env:MYSQL_PASSWORD }
  else { throw 'staging capacity measurement requires -MysqlPassword or MYSQL_PASSWORD' }
}
if (-not $OutputPath) {
  $stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
  $OutputPath = Join-Path $Root ".artifacts\stage2c4\capacity-$Environment-$stamp.json"
}

Assert-DockerContainerRunning $MysqlContainer
Assert-DockerContainerRunning $RedisContainer
$outboxRows = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql 'SELECT COUNT(*) FROM event_outbox')
$outboxBytes = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COALESCE(data_length+index_length,0) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='event_outbox'")
$pendingRows = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COUNT(*) FROM event_outbox WHERE status IN ('pending','retry_wait')")
$oldestEligibleAgeSeconds = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COALESCE(TIMESTAMPDIFF(SECOND,MIN(created_at),CURRENT_TIMESTAMP),0) FROM event_outbox WHERE status IN ('pending','retry_wait') AND available_at<=CURRENT_TIMESTAMP AND attempt_count<max_attempts")
$streamName = "xlb:dispatch:${CityCode}:orders"
$streamLengthRaw = @(& docker exec $RedisContainer redis-cli --raw XLEN $streamName 2>&1)
if ($LASTEXITCODE -ne 0) { throw "Redis XLEN failed: $($streamLengthRaw -join ' ')" }
$streamLength = [long]("$($streamLengthRaw[0])".Trim())

$storageWithinEnvelope = $outboxRows -le $MaxOutboxRows -and
  $outboxBytes -le $MaxOutboxBytes -and
  $streamLength -le $MaxRedisStreamLength
$operationalBacklogHealthy = $oldestEligibleAgeSeconds -le 300
$output = [IO.Path]::GetFullPath($OutputPath)
[IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null
[ordered]@{
  schemaVersion = 1
  observedAt = [DateTimeOffset]::UtcNow.ToString('o')
  environment = $Environment
  database = $Database
  cityCode = $CityCode
  outbox = [ordered]@{
    rows = $outboxRows
    bytes = $outboxBytes
    pendingOrRetryRows = $pendingRows
    oldestEligibleAgeSeconds = $oldestEligibleAgeSeconds
    maxRows = $MaxOutboxRows
    maxBytes = $MaxOutboxBytes
  }
  redisStream = [ordered]@{
    name = $streamName
    length = $streamLength
    maxLength = $MaxRedisStreamLength
  }
  storageWithinEnvelope = $storageWithinEnvelope
  operationalBacklogHealthy = $operationalBacklogHealthy
} | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $output
Write-Output "CAPACITY_EVIDENCE=$output"
if ($FailOnStorageEnvelope -and -not $storageWithinEnvelope) {
  throw 'Stage 2C-4 storage capacity envelope exceeded'
}
