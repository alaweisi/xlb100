param([switch]$RuntimeCanary)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$TrainId = "RT-GOV-VALIDATION-001"
$ComposeFile = Join-Path $Root "governance\execution\templates\docker-compose.worktree.yml"
$TrainRegistryFile = Join-Path $Root "governance\execution\train-registry.json"
$LeaseFile = Join-Path $Root "governance\execution\leases.json"
$BoundaryGateFile = Join-Path $Root "scripts\check-managed-worktree-boundaries.ps1"
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
function Assert-CleanHeadFile([string]$Path,[string]$Label) {
  $full=[IO.Path]::GetFullPath($Path);$prefix=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\';Assert-True($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase))"$Label is outside canonical root"
  $relative=$full.Substring($prefix.Length).Replace('\','/');$null=&git -C $Root ls-files --error-unmatch -- $relative 2>$null;Assert-True($LASTEXITCODE-eq0)"$Label must be tracked"
  $null=&git -C $Root cat-file -e "HEAD`:$relative" 2>$null;Assert-True($LASTEXITCODE-eq0)"$Label must exist in HEAD"
  $status=@(&git -C $Root status --porcelain=v1 -z --untracked-files=all -- $relative);Assert-True([string]::IsNullOrWhiteSpace(($status-join'')))"$Label must be clean and byte-bound to HEAD"
  $worktreeBlob=(&git -C $Root hash-object -- $relative).Trim();$headBlob=(&git -C $Root rev-parse "HEAD`:$relative").Trim()
  Assert-True($LASTEXITCODE-eq0-and$worktreeBlob-eq$headBlob)"$Label worktree blob differs from immutable HEAD"
}
function Test-SameSet($Left,$Right) {
  $a=@($Left|Sort-Object -Unique);$b=@($Right|Sort-Object -Unique)
  return ($a.Count-eq$b.Count-and@(Compare-Object $a $b).Count-eq0)
}
function ConvertTo-CanonicalRunAssets($ContainerObjects,$VolumeObjects,$NetworkObjects) {
  $containerMap=@{}
  foreach($container in @($ContainerObjects)){
    $id=[string]$container.Id;$service=[string]$container.Config.Labels.'com.docker.compose.service'
    if([string]::IsNullOrWhiteSpace($id)-or[string]::IsNullOrWhiteSpace($service)){continue}
    if($containerMap.ContainsKey($id)-and$containerMap[$id]-ne$service){throw"container ID resolves to conflicting compose services: $id"}
    $containerMap[$id]=$service
  }
  $containerIds=@($containerMap.Keys|Sort-Object)
  $containerServices=@($containerMap.Values|Sort-Object)
  $volumeNames=@($VolumeObjects|ForEach-Object{[string]$_.Name}|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)
  $networkNames=@($NetworkObjects|ForEach-Object{[string]$_.Name}|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)
  return [pscustomobject]@{Containers=$containerIds;ContainerServices=$containerServices;Volumes=$volumeNames;Networks=$networkNames;Count=$containerIds.Count+$volumeNames.Count+$networkNames.Count}
}
function Assert-NoUnexpectedRunAssets($Slot,$Assets) {
  $expectedServices=@("mysql","redis");$expectedVolumes=@($Slot.MysqlVolume,$Slot.RedisVolume);$expectedNetworks=@($Slot.Network)
  Assert-True (@($Assets.ContainerServices|Where-Object{$_-notin$expectedServices}).Count-eq0) "runtime inventory contains an unexpected container service for $($Slot.Project)"
  Assert-True (@($Assets.ContainerServices|Sort-Object -Unique).Count-eq$Assets.ContainerServices.Count) "runtime inventory contains duplicate container services for $($Slot.Project)"
  Assert-True (@($Assets.Volumes|Where-Object{$_-notin$expectedVolumes}).Count-eq0) "runtime inventory contains an unexpected volume for $($Slot.Project)"
  Assert-True (@($Assets.Networks|Where-Object{$_-notin$expectedNetworks}).Count-eq0) "runtime inventory contains an unexpected network for $($Slot.Project)"
}
function Assert-CompleteRunAssets($Slot,$Assets) {
  Assert-NoUnexpectedRunAssets $Slot $Assets
  Assert-True (Test-SameSet $Assets.ContainerServices @("mysql","redis")) "runtime container service set is incomplete for $($Slot.Project)"
  Assert-True (Test-SameSet $Assets.Volumes @($Slot.MysqlVolume,$Slot.RedisVolume)) "runtime volume set is incomplete for $($Slot.Project)"
  Assert-True (Test-SameSet $Assets.Networks @($Slot.Network)) "runtime network set is incomplete for $($Slot.Project)"
}
function Register-CleanupInventory([ref]$Cleanup,$Slot,$Inventory,[bool]$RequireComplete) {
  Assert-NoUnexpectedRunAssets $Slot $Inventory
  if($Inventory.Count-gt0){$Cleanup.Value+=[pscustomobject]@{Slot=$Slot;Inventory=$Inventory}}
  if($RequireComplete){Assert-CompleteRunAssets $Slot $Inventory}
}
function Invoke-InventoryFixtureTests {
  $longId=('a'*64);$networkId=('b'*64)
  $containerObjects=@(
    [pscustomobject]@{SourceRef=$longId.Substring(0,12);Id=$longId;Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}},
    [pscustomobject]@{SourceRef=$longId;Id=$longId;Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}}
  )
  $volumeObjects=@([pscustomobject]@{Name='fixture-volume'},[pscustomobject]@{Name='fixture-volume'})
  $networkObjects=@(
    [pscustomobject]@{SourceRef=$networkId.Substring(0,12);Name='fixture-network'},
    [pscustomobject]@{SourceRef='fixture-network';Name='fixture-network'}
  )
  $canonical=ConvertTo-CanonicalRunAssets $containerObjects $volumeObjects $networkObjects
  Assert-True($canonical.Containers.Count-eq1-and$canonical.Containers[0]-eq$longId)"fixture failed: short and long container IDs were not canonicalized"
  Assert-True($canonical.ContainerServices.Count-eq1-and$canonical.ContainerServices[0]-eq'mysql')"fixture failed: duplicate refs for one container ID duplicated its service"
  Assert-True($canonical.Networks.Count-eq1-and$canonical.Networks[0]-eq'fixture-network')"fixture failed: network ID and name were not canonicalized"
  $fixtureSlot=[pscustomobject]@{Project='fixture-project';MysqlVolume='fixture-mysql';RedisVolume='fixture-redis';Network='fixture-network'}
  $cleanup=@();$incomplete=[pscustomobject]@{Containers=@($longId);ContainerServices=@("mysql");Volumes=@();Networks=@();Count=1};$rejected=$false
  try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $incomplete $true}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq1)"fixture failed: incomplete verified inventory must be registered before complete-set rejection"
  $cleanup=@();$unexpected=[pscustomobject]@{Containers=@($longId);ContainerServices=@("unexpected");Volumes=@();Networks=@();Count=1};$rejected=$false
  try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $unexpected $false}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq0)"fixture failed: unexpected inventory must never be registered for automatic cleanup"
  $duplicateServiceAssets=ConvertTo-CanonicalRunAssets @(
    [pscustomobject]@{Id=('c'*64);Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}},
    [pscustomobject]@{Id=('d'*64);Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}}
  ) @() @()
  $cleanup=@();$rejected=$false;try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $duplicateServiceAssets $false}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq0)"fixture failed: two container IDs for one service must be rejected without cleanup registration"
}
function Get-ValidatedRunAssets($Slot) {
  $containerRefs=@(& docker ps -aq --filter "label=com.docker.compose.project=$($Slot.Project)")
  foreach($name in @("$($Slot.Project)-mysql-1","$($Slot.Project)-redis-1","$($Slot.Project)_mysql_1","$($Slot.Project)_redis_1")){
    if(Test-DockerObject "container" $name){$containerRefs+=,$name}
  }
  $volumeRefs=@(& docker volume ls -q --filter "label=com.docker.compose.project=$($Slot.Project)")
  foreach($name in @($Slot.MysqlVolume,$Slot.RedisVolume)){if(Test-DockerObject "volume" $name){$volumeRefs+=,$name}}
  $networkRefs=@(& docker network ls -q --filter "label=com.docker.compose.project=$($Slot.Project)")
  if(Test-DockerObject "network" $Slot.Network){$networkRefs+=,$Slot.Network}
  $containerObjects=@();foreach($ref in @($containerRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$obj=(& docker container inspect $ref|ConvertFrom-Json)[0];Assert-Labels $obj.Config.Labels $Slot "container:$ref";Assert-True($obj.Config.Labels.'com.docker.compose.project'-eq$Slot.Project)"container project label mismatch";$containerObjects+=,$obj}
  $volumeObjects=@();foreach($ref in @($volumeRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$obj=(& docker volume inspect $ref|ConvertFrom-Json)[0];Assert-Labels $obj.Labels $Slot "volume:$ref";Assert-True($obj.Labels.'com.docker.compose.project'-eq$Slot.Project)"volume project label mismatch";$volumeObjects+=,$obj}
  $networkObjects=@();foreach($ref in @($networkRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$obj=(& docker network inspect $ref|ConvertFrom-Json)[0];Assert-Labels $obj.Labels $Slot "network:$ref";Assert-True($obj.Labels.'com.docker.compose.project'-eq$Slot.Project)"network project label mismatch";$networkObjects+=,$obj}
  return (ConvertTo-CanonicalRunAssets $containerObjects $volumeObjects $networkObjects)
}

function Invoke-Main {
  Invoke-InventoryFixtureTests
  if($RuntimeCanary){
    Assert-CleanHeadFile $LeaseFile "managed-worktree Lease Ledger"
    Assert-CleanHeadFile $ComposeFile "managed-worktree canonical Compose template"
    Assert-CleanHeadFile $TrainRegistryFile "managed-worktree Train Registry"
    Assert-CleanHeadFile $BoundaryGateFile "managed-worktree boundary Gate"
    Assert-CleanHeadFile $PSCommandPath "managed-worktree Runtime Canary script"
  }
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
    Assert-True ($ref-match'^governance/execution/work-units/[^/]+\.json$') "workUnitRef is outside canonical work-units: $ref"
    $path=[IO.Path]::GetFullPath((Join-Path $Root ($ref-replace '/', '\'))); $manifest=Read-Json $path
    $null=&git -C $Root ls-files --error-unmatch -- $ref 2>$null;Assert-True($LASTEXITCODE-eq0)"manifest must be tracked: $ref"
    $null=&git -C $Root cat-file -e "HEAD`:$ref" 2>$null;Assert-True($LASTEXITCODE-eq0)"manifest must exist in HEAD: $ref"
    $manifestStatus=@(&git -C $Root status --porcelain=v1 -z --untracked-files=all -- $ref);Assert-True([string]::IsNullOrWhiteSpace(($manifestStatus-join'')))"manifest must be clean: $ref"
    Assert-True ($manifest.trainId-eq $train.trainId) "manifest train mismatch: $ref"
    Assert-True ($manifest.baseCommit-eq $train.baseCommit) "manifest baseCommit mismatch: $ref"
    Assert-True ($manifest.environment.envFileName-eq ".env.worktree.local") "manifest must use .env.worktree.local"
    Assert-True ($manifest.environment.composeOverrideRef-eq "governance/execution/templates/docker-compose.worktree.yml") "manifest must use the canonical worktree Compose template"
    $wt=Get-Lease $ledger $manifest.leaseRefs.worktreePath; Assert-Lease $wt $manifest "WORKTREE_PATH"; Assert-True ($wt.key-eq $manifest.worktreePath) "worktree path lease mismatch"
    $source=Get-Lease $ledger $manifest.leaseRefs.sourcePath; Assert-Lease $source $manifest "SOURCE_PATH"; Assert-True (Test-SameSet @($source.paths) @($manifest.allowedPaths)) "source path lease mismatch"
    $envLease=Get-Lease $ledger $manifest.leaseRefs.environment; Assert-Lease $envLease $manifest "ENVIRONMENT"
    Assert-True ($envLease.resources.composeProject-eq $manifest.environment.composeProject) "compose project lease mismatch"
    Assert-True ($envLease.resources.mysqlDatabase-eq $manifest.environment.mysqlDatabase) "database lease mismatch"
    Assert-True ($envLease.resources.redisNamespace-eq $manifest.environment.redisNamespace) "Redis namespace lease mismatch"
    foreach($name in $portNames){ $id=$manifest.leaseRefs.ports.$name; $lease=Get-Lease $ledger $id; Assert-Lease $lease $manifest "PORT"; $field="${name}Port"; Assert-True ($lease.portName-eq $name -and [int]$lease.port-eq [int]$manifest.environment.$field) "PORT lease mismatch: $id" }
    $digest=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant(); $nonce=[Guid]::NewGuid().ToString("N")
    $slots += [pscustomobject]@{Slot=[string]$manifest.environment.slot;TrainId=$manifest.trainId;WorkUnitId=$manifest.workUnitId;Project=$manifest.environment.composeProject;Database=$manifest.environment.mysqlDatabase;RedisNamespace=$manifest.environment.redisNamespace;MysqlPort=[string]$manifest.environment.mysqlPort;RedisPort=[string]$manifest.environment.redisPort;BackendPort=[string]$manifest.environment.backendPort;CustomerPort=[string]$manifest.environment.customerPort;WorkerPort=[string]$manifest.environment.workerPort;AdminPort=[string]$manifest.environment.adminPort;BaseCommit=$manifest.baseCommit;EnvironmentLeaseId=$envLease.leaseId;ManifestDigest=$digest;RunNonce=$nonce;MysqlPassword="Xlb_${nonce}_pw";RootPassword="Xlb_${nonce}_root";MysqlVolume=$envLease.resources.mysqlVolume;RedisVolume=$envLease.resources.redisVolume;Network=$envLease.resources.network}
  }

  $activePorts=@($ledger.leases|Where-Object {$_.type-eq"PORT"-and$_.status-eq"ACTIVE"}); $numbers=@($activePorts|ForEach-Object{[int]$_.port});Assert-True(@($numbers|Where-Object{$_-lt1-or$_-gt65535}).Count-eq0)"ACTIVE PORT lease is outside 1..65535"
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
  Assert-True ($registry.executionSystemStatus-eq"ENABLED") "RuntimeCanary blocked: executionSystemStatus must be ENABLED"
  Assert-True ($registry.enablementStatus-eq"ENABLED") "RuntimeCanary blocked: enablementStatus must be ENABLED"
  Assert-True ($train.status-eq"VALIDATION_AUTHORIZED") "RuntimeCanary blocked: Train status must be VALIDATION_AUTHORIZED"
  Assert-True ($train.humanApprovalStatus-eq"EXPLICIT_HUMAN_APPROVAL_RECORDED") "RuntimeCanary blocked: explicit Human approval is absent"
  Assert-True (($train.PSObject.Properties.Name-contains"runtimeCanaryAuthorized")-and$train.runtimeCanaryAuthorized-eq$true) "RuntimeCanary blocked: runtimeCanaryAuthorized must be true"
  Assert-True ($train.businessWriteAuthorized-eq$false) "RuntimeCanary blocked: businessWriteAuthorized must remain false"
  $authorityGate=& powershell -NoProfile -ExecutionPolicy Bypass -File $BoundaryGateFile -Mode Repository 2>&1
  Assert-True ($LASTEXITCODE-eq0) "RuntimeCanary blocked: strict authority/evidence Repository Gate failed: $($authorityGate|Out-String)"

  $listeners=[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
  foreach($slot in $slots){
    foreach($p in @($slot.MysqlPort,$slot.RedisPort,$slot.BackendPort,$slot.CustomerPort,$slot.WorkerPort,$slot.AdminPort)){Assert-True(-not($listeners-contains[int]$p))"port occupied: $p"}
    foreach($name in @("$($slot.Project)-mysql-1","$($slot.Project)-redis-1","$($slot.Project)_mysql_1","$($slot.Project)_redis_1")){Assert-True(-not(Test-DockerObject "container" $name))"old container exists: $name"}
    Assert-True(-not(Test-DockerObject "volume" $slot.MysqlVolume))"old volume exists";Assert-True(-not(Test-DockerObject "volume" $slot.RedisVolume))"old volume exists";Assert-True(-not(Test-DockerObject "network" $slot.Network))"old network exists"
    $byLabel=&docker ps -aq --filter "label=com.docker.compose.project=$($slot.Project)";Assert-True([string]::IsNullOrWhiteSpace(($byLabel|Out-String)))"old project containers exist"
    $volumeByLabel=&docker volume ls -q --filter "label=com.docker.compose.project=$($slot.Project)";Assert-True([string]::IsNullOrWhiteSpace(($volumeByLabel|Out-String)))"old project volumes exist"
    $networkByLabel=&docker network ls -q --filter "label=com.docker.compose.project=$($slot.Project)";Assert-True([string]::IsNullOrWhiteSpace(($networkByLabel|Out-String)))"old project networks exist"
  }
  $cleanup=@();$primary=$null;$cleanupFailures=@()
  try{
    foreach($slot in $slots){
      try{Invoke-Compose $slot @("up","-d","--wait","mysql","redis")|Out-Null}
      catch{
        $upFailure=$_
        try{$partial=Get-ValidatedRunAssets $slot;Register-CleanupInventory ([ref]$cleanup) $slot $partial $false}
        catch{throw "MANUAL_DISPOSITION_REQUIRED: partial-up asset could not be proven to this nonce: $($_.Exception.Message)"}
        throw $upFailure
      }
      try{$inventory=Get-ValidatedRunAssets $slot;Register-CleanupInventory ([ref]$cleanup) $slot $inventory $true}
      catch{throw "MANUAL_DISPOSITION_REQUIRED: complete asset set could not be proven to this nonce: $($_.Exception.Message)"}
    }
    foreach($slot in $slots){$marker="slot-$($slot.Slot)";$sql="CREATE TABLE IF NOT EXISTS worktree_isolation_probe(probe_key VARCHAR(64) PRIMARY KEY,probe_value VARCHAR(64));INSERT INTO worktree_isolation_probe VALUES('shared-key','$marker') ON DUPLICATE KEY UPDATE probe_value=VALUES(probe_value);";Invoke-Compose $slot @("exec","-T","-e","MYSQL_PWD=$($slot.MysqlPassword)","mysql","mysql","-uxlb",$slot.Database,"-e",$sql)|Out-Null;Invoke-Compose $slot @("exec","-T","redis","redis-cli","SET","xlb:isolation:probe",$marker)|Out-Null}
    foreach($slot in $slots){$expected="slot-$($slot.Slot)";$m=Invoke-Compose $slot @("exec","-T","-e","MYSQL_PWD=$($slot.MysqlPassword)","mysql","mysql","-uxlb",$slot.Database,"-N","-B","-e","SELECT probe_value FROM worktree_isolation_probe WHERE probe_key='shared-key';");$r=Invoke-Compose $slot @("exec","-T","redis","redis-cli","--raw","GET","xlb:isolation:probe");Assert-True($m.Trim()-eq$expected-and$r.Trim()-eq$expected)"cross-contamination detected"}
    Write-Host "PASS managed worktree runtime canary"
  }catch{$primary=$_}finally{for($i=$cleanup.Count-1;$i-ge0;$i--){$entry=$cleanup[$i];$slot=$entry.Slot;try{
    $assets=Get-ValidatedRunAssets $slot
    Assert-True (Test-SameSet $assets.Containers $entry.Inventory.Containers) "container inventory changed after verification"
    Assert-True (Test-SameSet $assets.Volumes $entry.Inventory.Volumes) "volume inventory changed after verification"
    Assert-True (Test-SameSet $assets.Networks $entry.Inventory.Networks) "network inventory changed after verification"
    foreach($id in $assets.Containers){& docker container rm -f $id|Out-Null;if($LASTEXITCODE-ne0){throw"container cleanup failed: $id"}}
    foreach($name in $assets.Volumes){& docker volume rm $name|Out-Null;if($LASTEXITCODE-ne0){throw"volume cleanup failed: $name"}}
    foreach($name in $assets.Networks){& docker network rm $name|Out-Null;if($LASTEXITCODE-ne0){throw"network cleanup failed: $name"}}
    $postContainers=@(& docker ps -aq --filter "label=com.docker.compose.project=$($slot.Project)");foreach($name in @("$($slot.Project)-mysql-1","$($slot.Project)-redis-1","$($slot.Project)_mysql_1","$($slot.Project)_redis_1")){if(Test-DockerObject "container" $name){$postContainers+=,$name}}
    $postVolumes=@(& docker volume ls -q --filter "label=com.docker.compose.project=$($slot.Project)");foreach($name in @($slot.MysqlVolume,$slot.RedisVolume)){if(Test-DockerObject "volume" $name){$postVolumes+=,$name}}
    $postNetworks=@(& docker network ls -q --filter "label=com.docker.compose.project=$($slot.Project)");if(Test-DockerObject "network" $slot.Network){$postNetworks+=,$slot.Network}
    Assert-True (@($postContainers|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-eq0) "postcondition failed: containers remain"
    Assert-True (@($postVolumes|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-eq0) "postcondition failed: volumes remain"
    Assert-True (@($postNetworks|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-eq0) "postcondition failed: networks remain"
  }catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: no down/remove-orphans executed for unproven inventory; $($_.Exception.Message)"}}}
  if($cleanupFailures.Count-gt0){throw "runtime cleanup failed: $($cleanupFailures-join'; ')"};if($null-ne$primary){throw $primary}
}

$rootBytes=[Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant());$sha=[Security.Cryptography.SHA256]::Create();$rootHash=(($sha.ComputeHash($rootBytes)|ForEach-Object{$_.ToString("x2")})-join"").Substring(0,24);$sha.Dispose()
$mutex=[Threading.Mutex]::new($false,"Global\XLB_MANAGED_WORKTREE_CONTROL_$rootHash");$acquired=$false
try{$acquired=$mutex.WaitOne(0);Assert-True $acquired "control-root mutex is already held";Invoke-Main}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
