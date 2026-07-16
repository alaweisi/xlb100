[CmdletBinding()]
param(
  [string]$MysqlContainer = 'xlb-mysql-local',
  [string]$RedisImage = 'redis:7',
  [string]$MysqlHost = '127.0.0.1',
  [int]$MysqlPort = 3306,
  [string]$AdminUser = 'root',
  [string]$AdminPassword = 'xlb_root_password'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. (Join-Path $Root 'deploy\backup\common.ps1')

Assert-SafeContainerName $MysqlContainer
Assert-DockerContainerRunning $MysqlContainer
$stamp = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
$suffix = $stamp.ToLowerInvariant().Replace('-', '').Replace('t', '-').Replace('z', '')
$redisContainer = "xlb-stage4a-redis-$suffix"
Assert-SafeContainerName $redisContainer
$artifactDirectory = Join-Path $Root '.artifacts\stage4a'
[IO.Directory]::CreateDirectory($artifactDirectory) | Out-Null
$summaryPath = Join-Path $artifactDirectory "drill-$stamp.json"
$migrationEvidencePath = Join-Path $artifactDirectory "migration-replay-$stamp.json"
$migrationScript = Join-Path $Root 'scripts\run-stage4a-migration-replay.ps1'
$drScript = Join-Path $Root 'scripts\run-stage2c4-drill.ps1'

$managedEnv = @(
  'NODE_ENV', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER',
  'MYSQL_PASSWORD', 'MYSQL_ROOT_USER', 'MYSQL_ROOT_PASSWORD', 'REDIS_HOST',
  'REDIS_PORT', 'XLB_STAGE2C3_REDIS_PORT', 'XLB_SKIP_DB_TESTS'
)
$previousEnv = @{}
foreach ($key in $managedEnv) { $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key) }

function Invoke-PnpmStep {
  param([Parameter(Mandatory)][string[]]$Arguments, [Parameter(Mandatory)][string]$Label)
  Push-Location $Root
  try {
    & pnpm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

$targetDatabase = ''
$redisStarted = $false
$startedAt = [DateTimeOffset]::UtcNow
try {
  $migrationOutput = @(& $migrationScript -Container $MysqlContainer -HostName $MysqlHost -Port $MysqlPort -AdminUser $AdminUser -AdminPassword $AdminPassword -EvidencePath $migrationEvidencePath -ConfirmIsolatedMigrationReplay -KeepTarget)
  if ($LASTEXITCODE -ne 0) { throw 'Stage 4A migration replay failed' }
  $databaseLine = @($migrationOutput | Where-Object { "$_" -like 'STAGE4A_MIGRATION_DATABASE=*' } | Select-Object -Last 1)
  if ($databaseLine.Count -ne 1) { throw 'Stage 4A migration replay did not return its isolated database' }
  $targetDatabase = "$($databaseLine[0])".Substring('STAGE4A_MIGRATION_DATABASE='.Length)
  if ($targetDatabase -notmatch '^xlb_stage4a_migration_[A-Za-z0-9_]{1,38}$') {
    throw 'Stage 4A migration replay returned an unsafe database name'
  }

  $redisId = @(& docker run --detach --name $redisContainer --label xlb.stage4a=true --publish '127.0.0.1::6379' $RedisImage redis-server --appendonly yes 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "isolated Redis start failed: $($redisId -join ' ')" }
  $redisStarted = $true
  $portText = @(& docker port $redisContainer '6379/tcp' 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "isolated Redis port lookup failed: $($portText -join ' ')" }
  $portMatch = [regex]::Match("$($portText[0])".Trim(), ':(\d+)$')
  if (-not $portMatch.Success) { throw "cannot parse isolated Redis port: $($portText[0])" }
  $redisPort = [int]$portMatch.Groups[1].Value
  $redisReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    $pong = @(& docker exec $redisContainer redis-cli --raw PING 2>$null)
    if ($LASTEXITCODE -eq 0 -and "$($pong[0])".Trim() -eq 'PONG') { $redisReady = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $redisReady) { throw 'isolated Redis did not become ready within 30 seconds' }

  $env:NODE_ENV = 'test'
  $env:MYSQL_HOST = $MysqlHost
  $env:MYSQL_PORT = "$MysqlPort"
  $env:MYSQL_DATABASE = $targetDatabase
  $env:MYSQL_USER = $AdminUser
  $env:MYSQL_PASSWORD = $AdminPassword
  $env:MYSQL_ROOT_USER = $AdminUser
  $env:MYSQL_ROOT_PASSWORD = $AdminPassword
  $env:REDIS_HOST = '127.0.0.1'
  $env:REDIS_PORT = "$redisPort"
  $env:XLB_STAGE2C3_REDIS_PORT = "$redisPort"
  $env:XLB_SKIP_DB_TESTS = '0'

  Invoke-PnpmStep -Label 'isolated database seed' -Arguments @('--filter', '@xlb/backend', 'exec', 'tsx', 'src/dal/seedCli.ts')
  Invoke-PnpmStep -Label 'isolated Redis Stream recovery test' -Arguments @(
    'exec', 'vitest', 'run', '--project', 'db-serial',
    'tests/integration/stage2c3RedisStreamReliability.test.ts'
  )
  Invoke-PnpmStep -Label 'isolated Outbox reliability tests' -Arguments @(
    'exec', 'vitest', 'run', '--project', 'db-serial',
    'tests/integration/outboxClaimConcurrency.test.ts',
    'tests/integration/orderPaymentOutbox.test.ts',
    'tests/integration/outboxToDispatchStream.test.ts'
  )

  $drOutput = @(& $drScript -Environment local -MysqlContainer $MysqlContainer -RedisContainer 'xlb-redis-local')
  if ($LASTEXITCODE -ne 0) { throw 'Stage 4A backup/restore/capacity drill failed' }
  $drEvidenceLine = @($drOutput | Where-Object { "$_" -like 'STAGE2C4_DRILL_EVIDENCE=*' } | Select-Object -Last 1)
  if ($drEvidenceLine.Count -ne 1) { throw 'backup/restore drill did not return its evidence path' }
  $drEvidencePath = "$($drEvidenceLine[0])".Substring('STAGE2C4_DRILL_EVIDENCE='.Length)
  $drEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $drEvidencePath | ConvertFrom-Json
  $migrationEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $migrationEvidencePath | ConvertFrom-Json
  $redisAof = @(& docker exec $redisContainer redis-cli --raw CONFIG GET appendonly 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'isolated Redis persistence verification failed' }

  $completedAt = [DateTimeOffset]::UtcNow
  [ordered]@{
    schemaVersion = 1
    drill = 'stage4a-local-data-reliability'
    startedAt = $startedAt.ToString('o')
    completedAt = $completedAt.ToString('o')
    durationSeconds = [Math]::Round(($completedAt - $startedAt).TotalSeconds, 3)
    sourceCommit = (git -C $Root rev-parse HEAD).Trim()
    migrationReplay = $migrationEvidence
    backupRestoreCapacityEvidence = $drEvidencePath
    backupRestoreCapacityResult = $drEvidence.result
    isolatedRedis = [ordered]@{
      image = $RedisImage
      appendonly = if ($redisAof.Count -gt 1) { "$($redisAof[1])" } else { 'unknown' }
      protocolRecoveryTest = 'PASS'
      removedAfterDrill = $true
    }
    outbox = [ordered]@{
      atomicClaimLeaseRetryDeadLetter = 'PASS'
      paymentAndDispatchLifecycle = 'PASS'
      mysqlToRedisRebuild = 'PASS'
      testDatabase = 'isolated and removed after drill'
    }
    realProviderUsed = $false
    productionOperationPerformed = $false
    productionReady = $false
    result = 'PASS_LOCAL_STAGE4A_DRILL'
  } | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 -LiteralPath $summaryPath
  Write-Output "STAGE4A_DRILL_EVIDENCE=$summaryPath"
} finally {
  foreach ($key in $managedEnv) {
    [Environment]::SetEnvironmentVariable($key, $previousEnv[$key])
  }
  $cleanupErrors = @()
  if ($redisStarted) {
    $redisCleanup = @(& docker rm --force $redisContainer 2>&1)
    if ($LASTEXITCODE -ne 0) {
      $cleanupErrors += "isolated Redis cleanup failed: $($redisCleanup -join ' ')"
    }
  }
  if ($targetDatabase) {
    try {
      Invoke-DockerText -MysqlPassword $AdminPassword -Arguments @(
        'exec', '-e', 'MYSQL_PWD', $MysqlContainer,
        'mysql', "-u$AdminUser", '-e', "DROP DATABASE IF EXISTS $targetDatabase"
      ) | Out-Null
    } catch {
      $cleanupErrors += "isolated database cleanup failed: $($_.Exception.Message)"
    }
  }
  if ($cleanupErrors.Count -gt 0) {
    throw ($cleanupErrors -join [Environment]::NewLine)
  }
}
