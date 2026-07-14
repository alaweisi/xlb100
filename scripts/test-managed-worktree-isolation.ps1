param(
  [switch]$RuntimeCanary,
  [string]$TrainId = "RT-GOV-VALIDATION-001",
  [string]$ComposeFile,
  [string]$TrainRegistryFile,
  [string]$LeaseFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
if (-not $ComposeFile) { $ComposeFile = Join-Path $Root "deploy\compose\docker-compose.worktree.yml" }
if (-not $TrainRegistryFile) { $TrainRegistryFile = Join-Path $Root "governance\execution\train-registry.json" }
if (-not $LeaseFile) { $LeaseFile = Join-Path $Root "governance\execution\leases.json" }
$ComposeFile = (Resolve-Path -LiteralPath $ComposeFile).Path
$TrainRegistryFile = (Resolve-Path -LiteralPath $TrainRegistryFile).Path
$LeaseFile = (Resolve-Path -LiteralPath $LeaseFile).Path

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Read-Json([string]$Path) { return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json) }
function Get-Lease($Ledger, [string]$Id) {
  $matches = @($Ledger.leases | Where-Object leaseId -eq $Id)
  Assert-True ($matches.Count -eq 1) "lease must exist exactly once: $Id"
  return $matches[0]
}
function Assert-Lease($Lease, $Manifest, [string]$Type) {
  Assert-True ($Lease.type -eq $Type) "lease $($Lease.leaseId) must be $Type"
  Assert-True ($Lease.status -eq "ACTIVE") "lease $($Lease.leaseId) must be ACTIVE"
  Assert-True ($Lease.trainId -eq $Manifest.trainId) "lease train mismatch: $($Lease.leaseId)"
  Assert-True ($Lease.workUnitId -eq $Manifest.workUnitId) "lease work-unit mismatch: $($Lease.leaseId)"
}
function Assert-Labels($Labels, $Slot, [string]$Resource) {
  $expected = @{
    "xlb.managed-worktree" = "true"; "xlb.train-id" = $Slot.TrainId
    "xlb.work-unit-id" = $Slot.WorkUnitId; "xlb.lease-id" = $Slot.EnvironmentLeaseId
    "xlb.manifest-digest" = $Slot.ManifestDigest; "xlb.base-commit" = $Slot.BaseCommit
    "xlb.run-nonce" = $Slot.RunNonce
  }
  foreach ($key in $expected.Keys) {
    $property = @($Labels.PSObject.Properties | Where-Object Name -eq $key)
    Assert-True ($property.Count -eq 1 -and [string]$property[0].Value -eq [string]$expected[$key]) "$Resource label mismatch: $key"
  }
}

$environmentKeys = @(
  "XLB_TRAIN_ID", "XLB_WORK_UNIT_ID", "WORKTREE_SLOT", "COMPOSE_PROJECT_NAME",
  "XLB_ENVIRONMENT_LEASE_ID", "XLB_MANIFEST_DIGEST", "XLB_BASE_COMMIT", "XLB_RUN_NONCE",
  "WORKTREE_MYSQL_HOST_PORT", "WORKTREE_REDIS_HOST_PORT", "BACKEND_PORT", "CUSTOMER_PORT", "WORKER_PORT", "ADMIN_PORT",
  "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD"
)
function Use-SlotEnvironment($Slot, [scriptblock]$Action) {
  $values = @{
    XLB_TRAIN_ID=$Slot.TrainId; XLB_WORK_UNIT_ID=$Slot.WorkUnitId; WORKTREE_SLOT=$Slot.Slot; COMPOSE_PROJECT_NAME=$Slot.Project
    XLB_ENVIRONMENT_LEASE_ID=$Slot.EnvironmentLeaseId; XLB_MANIFEST_DIGEST=$Slot.ManifestDigest; XLB_BASE_COMMIT=$Slot.BaseCommit; XLB_RUN_NONCE=$Slot.RunNonce
    WORKTREE_MYSQL_HOST_PORT=$Slot.MysqlPort; WORKTREE_REDIS_HOST_PORT=$Slot.RedisPort; BACKEND_PORT=$Slot.BackendPort
    CUSTOMER_PORT=$Slot.CustomerPort; WORKER_PORT=$Slot.WorkerPort; ADMIN_PORT=$Slot.AdminPort
    MYSQL_DATABASE=$Slot.Database; MYSQL_USER="xlb"; MYSQL_PASSWORD=$Slot.MysqlPassword; MYSQL_ROOT_PASSWORD=$Slot.RootPassword
  }
  $previous=@{}
  try { foreach($key in $environmentKeys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,"Process");[Environment]::SetEnvironmentVariable($key,[string]$values[$key],"Process")}; & $Action }
  finally { foreach($key in $environmentKeys){[Environment]::SetEnvironmentVariable($key,$previous[$key],"Process")} }
}
function Invoke-Compose($Slot, [string[]]$Arguments) {
  Use-SlotEnvironment $Slot { $output=& docker compose -f $ComposeFile @Arguments 2>&1; if($LASTEXITCODE-ne 0){throw "compose failed for $($Slot.Project): $($output|Out-String)"}; return ($output|Out-String).Trim() }
}
function Test-DockerObject([string]$Kind,[string]$Name) { $null=& docker $Kind inspect $Name 2>$null; if($LASTEXITCODE-eq 0){return $true}; if($LASTEXITCODE-eq 1){return $false}; throw "docker $Kind inspect failed: $Name" }
function Assert-RunAssets($Slot, [bool]$RequireComplete) {
  $count=0
  foreach($service in @("mysql","redis")){
    $id=Invoke-Compose $Slot @("ps","-q",$service)
    if(-not[string]::IsNullOrWhiteSpace($id)){
      $obj=(docker inspect $id|ConvertFrom-Json)[0]; Assert-Labels $obj.Config.Labels $Slot "$service-container"
      Assert-True ($obj.Config.Labels.'com.docker.compose.project'-eq$Slot.Project) "$service project label mismatch"; $count++
    }
  }
  foreach($item in @(@("volume",$Slot.MysqlVolume,"mysql-volume"),@("volume",$Slot.RedisVolume,"redis-volume"),@("network",$Slot.Network,"network"))){
    if(Test-DockerObject $item[0] $item[1]){
      $obj=(& docker $item[0] inspect $item[1]|ConvertFrom-Json)[0]; Assert-Labels $obj.Labels $Slot $item[2]
      Assert-True ($obj.Labels.'com.docker.compose.project'-eq$Slot.Project) "$($item[2]) project label mismatch"; $count++
    }
  }
  if($RequireComplete){Assert-True($count-eq5)"runtime asset set is incomplete for $($Slot.Project)"}
  return ($count-gt0)
}

function Invoke-Main {
  Assert-True ($null-ne(Get-Command docker -ErrorAction SilentlyContinue)) "docker is required"
  & docker compose version *> $null; Assert-True ($LASTEXITCODE-eq 0) "docker compose is required"
  & git -C $Root check-ignore -q --no-index -- ".env.worktree.local"
  Assert-True ($LASTEXITCODE-eq 0) ".env.worktree.local must be ignored by git"

  $registry=Read-Json $TrainRegistryFile; $ledger=Read-Json $LeaseFile
  Assert-True ([string]::Equals($registry.canonicalRoot,$Root,[StringComparison]::OrdinalIgnoreCase)) "registry canonical root mismatch"
  $trains=@($registry.trains|Where-Object trainId -eq $TrainId); Assert-True ($trains.Count-eq 1) "train must exist exactly once"
  $train=$trains[0]; Assert-True ($train.executionMode-eq "VALIDATION_ONLY") "only validation train is allowed"
  Assert-True ($train.humanApprovalStatus-ne "WAITING_HUMAN_APPROVAL") "train is not authorized"
  $refs=@($train.workUnitRefs); Assert-True ($refs.Count-eq 3) "validation train must reference exactly three manifests"

  $slots=@(); $portNames=@("mysql","redis","backend","customer","worker","admin")
  foreach($ref in $refs){
    $path=[IO.Path]::GetFullPath((Join-Path $Root ($ref-replace '/', '\'))); $manifest=Read-Json $path
    Assert-True ($manifest.trainId-eq $train.trainId) "manifest train mismatch: $ref"
    Assert-True ($manifest.baseCommit-eq $train.baseCommit) "manifest baseCommit mismatch: $ref"
    Assert-True ($manifest.environment.envFileName-eq ".env.worktree.local") "manifest must use .env.worktree.local"
    $wt=Get-Lease $ledger $manifest.leaseRefs.worktreePath; Assert-Lease $wt $manifest "WORKTREE_PATH"; Assert-True ($wt.key-eq $manifest.worktreePath) "worktree path lease mismatch"
    $source=Get-Lease $ledger $manifest.leaseRefs.sourcePath; Assert-Lease $source $manifest "SOURCE_PATH"; Assert-True (@($source.paths).Count-eq @($manifest.allowedPaths).Count) "source path lease mismatch"
    $envLease=Get-Lease $ledger $manifest.leaseRefs.environment; Assert-Lease $envLease $manifest "ENVIRONMENT"
    Assert-True ($envLease.resources.composeProject-eq $manifest.environment.composeProject) "compose project lease mismatch"
    Assert-True ($envLease.resources.mysqlDatabase-eq $manifest.environment.mysqlDatabase) "database lease mismatch"
    Assert-True ($envLease.resources.redisNamespace-eq $manifest.environment.redisNamespace) "Redis namespace lease mismatch"
    foreach($name in $portNames){ $id=$manifest.leaseRefs.ports.$name; $lease=Get-Lease $ledger $id; Assert-Lease $lease $manifest "PORT"; $field="${name}Port"; Assert-True ($lease.portName-eq $name -and [int]$lease.port-eq [int]$manifest.environment.$field) "PORT lease mismatch: $id" }
    $digest=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant(); $nonce=[Guid]::NewGuid().ToString("N")
    $slots += [pscustomobject]@{Slot=[string]$manifest.environment.slot;TrainId=$manifest.trainId;WorkUnitId=$manifest.workUnitId;Project=$manifest.environment.composeProject;Database=$manifest.environment.mysqlDatabase;RedisNamespace=$manifest.environment.redisNamespace;MysqlPort=[string]$manifest.environment.mysqlPort;RedisPort=[string]$manifest.environment.redisPort;BackendPort=[string]$manifest.environment.backendPort;CustomerPort=[string]$manifest.environment.customerPort;WorkerPort=[string]$manifest.environment.workerPort;AdminPort=[string]$manifest.environment.adminPort;BaseCommit=$manifest.baseCommit;EnvironmentLeaseId=$envLease.leaseId;ManifestDigest=$digest;RunNonce=$nonce;MysqlPassword="Xlb_${nonce}_pw";RootPassword="Xlb_${nonce}_root";MysqlVolume=$envLease.resources.mysqlVolume;RedisVolume=$envLease.resources.redisVolume;Network=$envLease.resources.network}
  }

  $activePorts=@($ledger.leases|Where-Object {$_.type-eq"PORT"-and$_.status-eq"ACTIVE"}); $numbers=@($activePorts|ForEach-Object{[int]$_.port})
  Assert-True (@($numbers|Sort-Object -Unique).Count-eq $numbers.Count) "ACTIVE PORT leases contain a global collision"
  foreach($property in @("Project","Database","RedisNamespace","MysqlPort","RedisPort","BackendPort","CustomerPort","WorkerPort","AdminPort","MysqlVolume","RedisVolume","Network")){ $values=@($slots.$property); Assert-True (@($values|Sort-Object -Unique).Count-eq 3) "$property must be globally unique" }

  $results=@()
  foreach($slot in $slots){
    $config=(Invoke-Compose $slot @("config","--format","json"))|ConvertFrom-Json
    Assert-True ($config.name-eq $slot.Project) "project mismatch"; Assert-True ($config.services.mysql.restart-eq "no"-and$config.services.redis.restart-eq"no") "restart must be no"
    Assert-True (-not($config.services.mysql.PSObject.Properties.Name-contains"container_name")) "container_name is forbidden"
    Assert-Labels $config.services.mysql.labels $slot "mysql"; Assert-Labels $config.services.redis.labels $slot "redis"
    $mp=@($config.services.mysql.ports|Where-Object{[int]$_.target-eq3306})[0]; $rp=@($config.services.redis.ports|Where-Object{[int]$_.target-eq6379})[0]
    Assert-True ([string]$mp.published-eq$slot.MysqlPort-and$mp.host_ip-eq"127.0.0.1") "MySQL port mismatch"; Assert-True ([string]$rp.published-eq$slot.RedisPort-and$rp.host_ip-eq"127.0.0.1") "Redis port mismatch"
    $mv=($config.volumes.PSObject.Properties|Where-Object Name -eq "mysql-data").Value; $rv=($config.volumes.PSObject.Properties|Where-Object Name -eq "redis-data").Value; $net=($config.networks.PSObject.Properties|Where-Object Name -eq "worktree").Value
    Assert-True ($mv.name-eq$slot.MysqlVolume-and$rv.name-eq$slot.RedisVolume-and$net.name-eq$slot.Network) "leased Docker resource mismatch"
    Assert-Labels $mv.labels $slot "mysql-volume"; Assert-Labels $rv.labels $slot "redis-volume"; Assert-Labels $net.labels $slot "network"
    $results += [pscustomobject]@{Slot=$slot.Slot;Project=$slot.Project;MySQL=$slot.MysqlPort;Redis=$slot.RedisPort;Backend=$slot.BackendPort;Customer=$slot.CustomerPort;Worker=$slot.WorkerPort;Admin=$slot.AdminPort;Digest=$slot.ManifestDigest.Substring(0,12)}
  }
  Write-Host "PASS managed worktree manifest/train/lease/static isolation"; $results|Format-Table -AutoSize
  if(-not$RuntimeCanary){Write-Host "Runtime canary skipped.";return}

  $listeners=[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
  foreach($slot in $slots){
    foreach($p in @($slot.MysqlPort,$slot.RedisPort,$slot.BackendPort,$slot.CustomerPort,$slot.WorkerPort,$slot.AdminPort)){Assert-True(-not($listeners-contains[int]$p))"port occupied: $p"}
    foreach($name in @("$($slot.Project)-mysql-1","$($slot.Project)-redis-1","$($slot.Project)_mysql_1","$($slot.Project)_redis_1")){Assert-True(-not(Test-DockerObject "container" $name))"old container exists: $name"}
    Assert-True(-not(Test-DockerObject "volume" $slot.MysqlVolume))"old volume exists";Assert-True(-not(Test-DockerObject "volume" $slot.RedisVolume))"old volume exists";Assert-True(-not(Test-DockerObject "network" $slot.Network))"old network exists"
    $byLabel=&docker ps -aq --filter "label=com.docker.compose.project=$($slot.Project)";Assert-True([string]::IsNullOrWhiteSpace(($byLabel|Out-String)))"old project assets exist"
  }
  $cleanup=@();$primary=$null;$cleanupFailures=@()
  try{
    foreach($slot in $slots){
      try{Invoke-Compose $slot @("up","-d","--wait","mysql","redis")|Out-Null}
      catch{
        if(Assert-RunAssets $slot $false){$cleanup+=$slot}
        throw
      }
      Assert-True (Assert-RunAssets $slot $true) "runtime assets not created"
      $cleanup+=$slot
    }
    foreach($slot in $slots){$marker="slot-$($slot.Slot)";$sql="CREATE TABLE IF NOT EXISTS worktree_isolation_probe(probe_key VARCHAR(64) PRIMARY KEY,probe_value VARCHAR(64));INSERT INTO worktree_isolation_probe VALUES('shared-key','$marker') ON DUPLICATE KEY UPDATE probe_value=VALUES(probe_value);";Invoke-Compose $slot @("exec","-T","-e","MYSQL_PWD=$($slot.MysqlPassword)","mysql","mysql","-uxlb",$slot.Database,"-e",$sql)|Out-Null;Invoke-Compose $slot @("exec","-T","redis","redis-cli","SET","xlb:isolation:probe",$marker)|Out-Null}
    foreach($slot in $slots){$expected="slot-$($slot.Slot)";$m=Invoke-Compose $slot @("exec","-T","-e","MYSQL_PWD=$($slot.MysqlPassword)","mysql","mysql","-uxlb",$slot.Database,"-N","-B","-e","SELECT probe_value FROM worktree_isolation_probe WHERE probe_key='shared-key';");$r=Invoke-Compose $slot @("exec","-T","redis","redis-cli","--raw","GET","xlb:isolation:probe");Assert-True($m.Trim()-eq$expected-and$r.Trim()-eq$expected)"cross-contamination detected"}
    Write-Host "PASS managed worktree runtime canary"
  }catch{$primary=$_}finally{for($i=$cleanup.Count-1;$i-ge0;$i--){$slot=$cleanup[$i];try{if(Assert-RunAssets $slot $false){Invoke-Compose $slot @("down","--volumes","--remove-orphans")|Out-Null};if((Test-DockerObject "volume" $slot.MysqlVolume)-or(Test-DockerObject "volume" $slot.RedisVolume)-or(Test-DockerObject "network" $slot.Network)){throw"resource survived cleanup"}}catch{$cleanupFailures+="$($slot.Project): $($_.Exception.Message)"}}}
  if($cleanupFailures.Count-gt0){throw "runtime cleanup failed: $($cleanupFailures-join'; ')"};if($null-ne$primary){throw $primary}
}

$rootBytes=[Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant());$sha=[Security.Cryptography.SHA256]::Create();$rootHash=(($sha.ComputeHash($rootBytes)|ForEach-Object{$_.ToString("x2")})-join"").Substring(0,24);$sha.Dispose()
$mutex=[Threading.Mutex]::new($false,"Global\XLB_MANAGED_WORKTREE_CONTROL_$rootHash");$acquired=$false
try{$acquired=$mutex.WaitOne(0);Assert-True $acquired "control-root mutex is already held";Invoke-Main}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
