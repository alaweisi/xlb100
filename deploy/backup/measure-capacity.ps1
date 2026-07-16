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
$pendingRows = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COUNT(*) FROM event_outbox WHERE city_code='$CityCode' AND status IN ('pending','retry_wait')")
$transactionalEventTypes = "'order.created','fulfillment.completed','refund.approved'"
$transactionalPendingRows = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COUNT(*) FROM event_outbox WHERE city_code='$CityCode' AND event_type IN ($transactionalEventTypes) AND status IN ('pending','retry_wait')")
$sourceRecordPendingRows = [long](Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql "SELECT COUNT(*) FROM event_outbox WHERE city_code='$CityCode' AND event_type NOT IN ($transactionalEventTypes) AND status IN ('pending','retry_wait')")
$claimableCountSql = "SUM(CASE WHEN e.available_at<=CURRENT_TIMESTAMP AND e.attempt_count<e.max_attempts THEN 1 ELSE 0 END)"
$oldestClaimableSql = "MIN(CASE WHEN e.available_at<=CURRENT_TIMESTAMP AND e.attempt_count<e.max_attempts THEN e.created_at END)"
$measurementColumns = "CONCAT(COUNT(*),'|',COALESCE($claimableCountSql,0),'|',COALESCE(TIMESTAMPDIFF(SECOND,$oldestClaimableSql,CURRENT_TIMESTAMP),0))"
$orderClaimableSql = "SELECT $measurementColumns FROM orders o FORCE INDEX(idx_orders_status) STRAIGHT_JOIN event_outbox e FORCE INDEX(idx_event_outbox_aggregate_id) ON e.aggregate_id=o.order_id AND e.city_code=o.city_code AND e.event_type='order.created' WHERE o.city_code='$CityCode' AND o.status='pending_dispatch' AND e.status IN ('pending','retry_wait')"
$fulfillmentClaimableSql = "SELECT $measurementColumns FROM event_outbox e FORCE INDEX(idx_event_outbox_typed_claim) INNER JOIN fulfillments f ON f.city_code=e.city_code AND f.fulfillment_id=e.aggregate_id INNER JOIN orders o ON o.city_code=f.city_code AND o.order_id=f.order_id INNER JOIN payment_orders p FORCE INDEX(idx_payment_orders_city_order_status) ON p.city_code=o.city_code AND p.order_id=o.order_id AND p.status='paid' WHERE e.city_code='$CityCode' AND e.event_type='fulfillment.completed' AND e.status IN ('pending','retry_wait') AND f.status='completed' AND o.status='paid'"
$refundClaimableSql = "SELECT $measurementColumns FROM event_outbox e FORCE INDEX(idx_event_outbox_typed_claim) WHERE e.city_code='$CityCode' AND e.event_type='refund.approved' AND e.status IN ('pending','retry_wait')"
$claimableMeasurements = @($orderClaimableSql, $fulfillmentClaimableSql, $refundClaimableSql) | ForEach-Object {
  $parts = "$(Invoke-MysqlScalar -Container $MysqlContainer -Database $Database -User $MysqlUser -Password $MysqlPassword -Sql $_)".Split('|')
  [pscustomobject]@{ StateEligible = [long]$parts[0]; Count = [long]$parts[1]; OldestAgeSeconds = [long]$parts[2] }
}
$claimablePendingRows = [long](($claimableMeasurements | Measure-Object -Property Count -Sum).Sum)
$stateEligibleRows = [long](($claimableMeasurements | Measure-Object -Property StateEligible -Sum).Sum)
$stalledTransactionalRows = [Math]::Max(0, $transactionalPendingRows - $stateEligibleRows)
$oldestEligibleAgeSeconds = [long](($claimableMeasurements | Measure-Object -Property OldestAgeSeconds -Maximum).Maximum)
$streamName = "xlb:dispatch:${CityCode}:orders"
$streamLengthRaw = @(& docker exec $RedisContainer redis-cli --raw XLEN $streamName 2>&1)
if ($LASTEXITCODE -ne 0) { throw "Redis XLEN failed: $($streamLengthRaw -join ' ')" }
$streamLength = [long]("$($streamLengthRaw[0])".Trim())

$storageWithinEnvelope = $outboxRows -le $MaxOutboxRows -and
  $outboxBytes -le $MaxOutboxBytes -and
  $streamLength -le $MaxRedisStreamLength
$claimableBacklogHealthy = $oldestEligibleAgeSeconds -le 300
$transactionalConsistencyHealthy = $stalledTransactionalRows -eq 0
$operationalBacklogHealthy = $claimableBacklogHealthy -and $transactionalConsistencyHealthy
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
    transactionalPendingOrRetryRows = $transactionalPendingRows
    claimablePendingOrRetryRows = $claimablePendingRows
    stalledTransactionalPendingOrRetryRows = $stalledTransactionalRows
    projectionOrAuditPendingOrRetryRows = $sourceRecordPendingRows
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
  claimableBacklogHealthy = $claimableBacklogHealthy
  transactionalConsistencyHealthy = $transactionalConsistencyHealthy
  operationalBacklogHealthy = $operationalBacklogHealthy
} | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $output
Write-Output "CAPACITY_EVIDENCE=$output"
if ($FailOnStorageEnvelope -and -not $storageWithinEnvelope) {
  throw 'Stage 2C-4 storage capacity envelope exceeded'
}
