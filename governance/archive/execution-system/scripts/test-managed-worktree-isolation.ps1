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
$script:FrozenSnapshot=$null
$script:FrozenComposeText=$null
$script:RuntimeAuthority=$null
$script:RuntimeBinding=$null

function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Read-Json([string]$Path) { return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json) }
function Get-Sha256Hex([string]$Text){$sha=[Security.Cryptography.SHA256]::Create();try{return(($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))|ForEach-Object{$_.ToString('x2')})-join'')}finally{$sha.Dispose()}}
function Get-ManifestBlobDigest([string]$BlobOid){Assert-True($BlobOid-match'^[0-9a-fA-F]{40,64}$')"manifest blob OID is invalid";return Get-Sha256Hex "GIT_BLOB_OID_SHA256_V1`nblobOid=$($BlobOid.ToLowerInvariant())"}
function Get-RelativePath([string]$Path){$full=[IO.Path]::GetFullPath($Path);$prefix=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\';Assert-True($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase))"path is outside canonical root: $Path";return $full.Substring($prefix.Length).Replace('\','/')}
function Read-GitText([string]$Commit,[string]$Ref){$output=@(&git -C $Root show "$Commit`:$Ref" 2>&1);Assert-True($LASTEXITCODE-eq0)"frozen Git input is missing: $Ref";return($output-join"`n")}
function Read-ControlJson([string]$Ref){if($null-ne$script:FrozenSnapshot){return(Read-GitText $script:FrozenSnapshot.RunHead $Ref|ConvertFrom-Json)};return Read-Json (Join-Path $Root ($Ref-replace'/','\'))}
function Get-GitBlob([string]$Commit,[string]$Ref){$blob=(&git -C $Root rev-parse "$Commit`:$Ref" 2>$null).Trim();Assert-True($LASTEXITCODE-eq0-and$blob-match'^[0-9a-f]{40,64}$')"frozen Git blob is missing: $Ref";return $blob}
function Get-RuntimeInputPaths($Registry){$train=@($Registry.trains|Where-Object trainId -eq $TrainId);Assert-True($train.Count-eq1)"runtime validation Train missing from frozen registry";$paths=@('scripts/test-managed-worktree-isolation.ps1','scripts/check-managed-worktree-boundaries.ps1','governance/execution/templates/docker-compose.worktree.yml','governance/execution/leases.json','governance/execution/integration-queue.json','governance/execution/migration-reservations.json');foreach($ref in @($train[0].workUnitRefs)){Assert-True("$ref"-match'^governance/execution/work-units/[^/]+\.json$')"runtime workUnitRef is noncanonical: $ref";$paths+="$ref"};return@($paths|Sort-Object -Unique)}
function Get-RuntimeInputDigest([string]$Commit,$Registry){$entries=@();foreach($ref in @(Get-RuntimeInputPaths $Registry)){$entries+="$ref=$(Get-GitBlob $Commit $ref)"};return Get-Sha256Hex("GIT_PATH_BLOB_SET_SHA256_V1`ntrainId=$TrainId`n"+($entries-join"`n"))}
function New-FrozenSnapshot {
  $head=(&git -C $Root rev-parse HEAD 2>$null).Trim();Assert-True($LASTEXITCODE-eq0-and$head-match'^[0-9a-f]{40}$')"Runtime Canary requires an immutable HEAD"
  $status=@(&git -C $Root status --porcelain=v1 -z --untracked-files=all);Assert-True($LASTEXITCODE-eq0-and[string]::IsNullOrWhiteSpace(($status-join'')))"Runtime Canary requires a completely clean repository"
  $registry=Read-GitText $head 'governance/execution/train-registry.json'|ConvertFrom-Json;$paths=@((Get-RuntimeInputPaths $registry)+@('governance/execution/train-registry.json'));$blobs=@{};foreach($ref in @($paths|Sort-Object -Unique)){$blobs[$ref]=Get-GitBlob $head $ref}
  return[pscustomobject]@{RunHead=$head;Registry=$registry;Paths=@($paths|Sort-Object -Unique);Blobs=$blobs;RuntimeInputDigest=Get-RuntimeInputDigest $head $registry}
}
function Assert-FrozenSnapshotObservation($Snapshot,$Observation,[string]$Stage){Assert-True($Observation.Head-eq$Snapshot.RunHead)"$Stage blocked: repository HEAD changed after Runtime candidate freeze";Assert-True(-not$Observation.Dirty)"$Stage blocked: repository became dirty after Runtime candidate freeze";foreach($ref in $Snapshot.Paths){Assert-True($Observation.Blobs.ContainsKey($ref)-and$Observation.Blobs[$ref]-eq$Snapshot.Blobs[$ref])"$Stage blocked: frozen input blob changed: $ref"}}
function Assert-FrozenRunState([string]$Stage){
  if($null-eq$script:FrozenSnapshot){return};$head=(&git -C $Root rev-parse HEAD 2>$null).Trim();Assert-True($LASTEXITCODE-eq0)"$Stage cannot read repository HEAD";$status=@(&git -C $Root status --porcelain=v1 -z --untracked-files=all);Assert-True($LASTEXITCODE-eq0)"$Stage cannot read repository status";$blobs=@{};foreach($ref in $script:FrozenSnapshot.Paths){$blobs[$ref]=Get-GitBlob $head $ref};Assert-FrozenSnapshotObservation $script:FrozenSnapshot ([pscustomobject]@{Head=$head;Dirty=-not[string]::IsNullOrWhiteSpace(($status-join''));Blobs=$blobs}) $Stage
}
function Get-DockerBindingDigest([string]$Context,[string]$Endpoint,[string]$EngineId){return Get-Sha256Hex "DOCKER_DAEMON_BINDING_SHA256_V1`ncontext=$Context`nendpoint=$Endpoint`nengineId=$EngineId"}
function Assert-DockerSelectorPolicy($Binding){
  Assert-True([string]::IsNullOrWhiteSpace($env:DOCKER_HOST))"ambient DOCKER_HOST is forbidden for Runtime Canary"
  Assert-True([string]::IsNullOrWhiteSpace($env:DOCKER_CONTEXT)-or$env:DOCKER_CONTEXT-eq$Binding.Context)"ambient DOCKER_CONTEXT differs from approved context"
  Assert-True($Binding.Endpoint-match'^npipe://')"approved Docker endpoint must be local npipe"
  Assert-True((Get-DockerBindingDigest $Binding.Context $Binding.Endpoint $Binding.EngineId)-eq$Binding.BindingDigest)"Docker binding digest mismatch"
}
function Assert-DockerBindingObservation($Binding,$Observation,[string]$Stage){Assert-DockerSelectorPolicy $Binding;Assert-True($Observation.ContextEndpoint-eq$Binding.Endpoint)"$Stage detected Docker context endpoint drift";Assert-True($Observation.EngineId-eq$Binding.EngineId)"$Stage detected Docker engine identity drift"}
function Assert-DockerBindingLive([string]$Stage){
  $binding=$script:RuntimeBinding;Assert-True($null-ne$binding)"$Stage requires an approved Docker binding";Assert-DockerSelectorPolicy $binding
  $endpointJson=@(&docker context inspect $binding.Context --format '{{json .Endpoints.docker.Host}}' 2>&1);Assert-True($LASTEXITCODE-eq0)"$Stage cannot inspect approved Docker context";$endpoint=($endpointJson-join''|ConvertFrom-Json)
  $engine=@(&docker --host $binding.Endpoint info --format '{{.ID}}' 2>&1);Assert-True($LASTEXITCODE-eq0)"$Stage cannot inspect approved Docker engine";Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint=$endpoint;EngineId=($engine-join'').Trim()}) $Stage
}
function Invoke-BoundDocker([string[]]$Arguments,[string]$Stage,[switch]$Cleanup){
  if(-not$Cleanup){Assert-FrozenRunState $Stage}
  Assert-DockerBindingLive $Stage
  $output=@(&docker --host $script:RuntimeBinding.Endpoint @Arguments 2>&1)
  $exitCode=$LASTEXITCODE
  # A daemon/context can change while a command is in flight.  Re-check after
  # every bound invocation (including cleanup) so an apparently successful
  # command cannot be attributed to an unapproved engine.
  if(-not$Cleanup){Assert-FrozenRunState "$Stage post-command"}
  Assert-DockerBindingLive "$Stage post-command"
  return[pscustomobject]@{ExitCode=$exitCode;Output=@($output)}
}
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
    "xlb.run-nonce" = $Slot.RunNonce;"xlb.runtime-candidate-commit"=$Slot.RuntimeCandidateCommit
    "xlb.runtime-head-commit"=$Slot.RuntimeHeadCommit;"xlb.runtime-input-digest"=$Slot.RuntimeInputDigest
    "xlb.docker-engine-id"=$Slot.DockerEngineId;"xlb.docker-binding-digest"=$Slot.DockerBindingDigest
  }
  foreach ($key in $expected.Keys) {
    $property = @($Labels.PSObject.Properties | Where-Object Name -eq $key)
    Assert-True ($property.Count -eq 1 -and [string]$property[0].Value -eq [string]$expected[$key]) "$Resource label mismatch: $key"
  }
}

$environmentKeys = @(
  "XLB_TRAIN_ID", "XLB_WORK_UNIT_ID", "WORKTREE_SLOT", "COMPOSE_PROJECT_NAME",
  "XLB_ENVIRONMENT_LEASE_ID", "XLB_MANIFEST_DIGEST", "XLB_BASE_COMMIT", "XLB_RUN_NONCE",
  "XLB_RUNTIME_CANDIDATE_COMMIT","XLB_RUNTIME_HEAD_COMMIT","XLB_RUNTIME_INPUT_DIGEST","XLB_DOCKER_ENGINE_ID","XLB_DOCKER_BINDING_DIGEST",
  "WORKTREE_MYSQL_HOST_PORT", "WORKTREE_REDIS_HOST_PORT", "BACKEND_PORT", "CUSTOMER_PORT", "WORKER_PORT", "ADMIN_PORT",
  "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD"
)
function Use-SlotEnvironment($Slot, [scriptblock]$Action) {
  $values = @{
    XLB_TRAIN_ID=$Slot.TrainId; XLB_WORK_UNIT_ID=$Slot.WorkUnitId; WORKTREE_SLOT=$Slot.Slot; COMPOSE_PROJECT_NAME=$Slot.Project
    XLB_ENVIRONMENT_LEASE_ID=$Slot.EnvironmentLeaseId; XLB_MANIFEST_DIGEST=$Slot.ManifestDigest; XLB_BASE_COMMIT=$Slot.BaseCommit; XLB_RUN_NONCE=$Slot.RunNonce
    XLB_RUNTIME_CANDIDATE_COMMIT=$Slot.RuntimeCandidateCommit;XLB_RUNTIME_HEAD_COMMIT=$Slot.RuntimeHeadCommit;XLB_RUNTIME_INPUT_DIGEST=$Slot.RuntimeInputDigest;XLB_DOCKER_ENGINE_ID=$Slot.DockerEngineId;XLB_DOCKER_BINDING_DIGEST=$Slot.DockerBindingDigest
    WORKTREE_MYSQL_HOST_PORT=$Slot.MysqlPort; WORKTREE_REDIS_HOST_PORT=$Slot.RedisPort; BACKEND_PORT=$Slot.BackendPort
    CUSTOMER_PORT=$Slot.CustomerPort; WORKER_PORT=$Slot.WorkerPort; ADMIN_PORT=$Slot.AdminPort
    MYSQL_DATABASE=$Slot.Database; MYSQL_USER="xlb"; MYSQL_PASSWORD=$Slot.MysqlPassword; MYSQL_ROOT_PASSWORD=$Slot.RootPassword
  }
  $previous=@{}
  try { foreach($key in $environmentKeys){$previous[$key]=[Environment]::GetEnvironmentVariable($key,"Process");[Environment]::SetEnvironmentVariable($key,[string]$values[$key],"Process")}; & $Action }
  finally { foreach($key in $environmentKeys){[Environment]::SetEnvironmentVariable($key,$previous[$key],"Process")} }
}
function Invoke-Compose($Slot, [string[]]$Arguments) {
  Use-SlotEnvironment $Slot {
    $stage="compose $($Arguments-join' ')"
    if($null-ne$script:RuntimeBinding){Assert-FrozenRunState $stage;Assert-DockerBindingLive $stage;$output=@($script:FrozenComposeText|&docker --host $script:RuntimeBinding.Endpoint compose -f - @Arguments 2>&1)}
    elseif($null-ne$script:FrozenSnapshot){$output=@($script:FrozenComposeText|&docker compose -f - @Arguments 2>&1)}
    else{$output=@(&docker compose -f $ComposeFile @Arguments 2>&1)}
    $exitCode=$LASTEXITCODE
    if($null-ne$script:RuntimeBinding){
      # Re-check both the frozen repository inputs and daemon identity after
      # each compose mutation/query, before its result is consumed.
      Assert-FrozenRunState "$stage post-command"
      Assert-DockerBindingLive "$stage post-command"
    }
    if($exitCode-ne0){throw "compose failed for $($Slot.Project): $($output|Out-String)"};return($output|Out-String).Trim()
  }
}
function Test-DockerObject([string]$Kind,[string]$Name,[switch]$Cleanup){$result=Invoke-BoundDocker -Arguments @($Kind,'inspect',$Name) -Stage "inspect $Kind $Name" -Cleanup:$Cleanup;if($result.ExitCode-eq0){return$true};if($result.ExitCode-eq1){return$false};throw"docker $Kind inspect failed: $Name"}
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
    $id=[string]$container.Id;$service=[string]$container.Config.Labels.'com.docker.compose.service';$name=([string]$container.Name).TrimStart('/')
    if([string]::IsNullOrWhiteSpace($id)-or[string]::IsNullOrWhiteSpace($service)-or[string]::IsNullOrWhiteSpace($name)){throw"inspected container lacks canonical ID, service, or name"}
    if($containerMap.ContainsKey($id)-and($containerMap[$id].Service-ne$service-or$containerMap[$id].Name-ne$name)){throw"container ID resolves to conflicting compose identity: $id"}
    $containerMap[$id]=[pscustomobject]@{Service=$service;Name=$name}
  }
  $containerIds=@($containerMap.Keys|Sort-Object)
  $containerServices=@($containerMap.Values|ForEach-Object{$_.Service}|Sort-Object)
  $containerNames=@($containerMap.Values|ForEach-Object{$_.Name}|Sort-Object)
  $volumeNames=@($VolumeObjects|ForEach-Object{[string]$_.Name}|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)
  $networkNames=@($NetworkObjects|ForEach-Object{[string]$_.Name}|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)
  return [pscustomobject]@{Containers=$containerIds;ContainerServices=$containerServices;ContainerNames=$containerNames;Volumes=$volumeNames;Networks=$networkNames;Count=$containerIds.Count+$volumeNames.Count+$networkNames.Count}
}
function Assert-NoUnexpectedRunAssets($Slot,$Assets) {
  $expectedServices=@("mysql","redis");$expectedNames=@("$($Slot.Project)-mysql-1","$($Slot.Project)-redis-1");$expectedVolumes=@($Slot.MysqlVolume,$Slot.RedisVolume);$expectedNetworks=@($Slot.Network)
  Assert-True (@($Assets.ContainerServices|Where-Object{$_-notin$expectedServices}).Count-eq0) "runtime inventory contains an unexpected container service for $($Slot.Project)"
  Assert-True (@($Assets.ContainerServices|Sort-Object -Unique).Count-eq$Assets.ContainerServices.Count) "runtime inventory contains duplicate container services for $($Slot.Project)"
  Assert-True (@($Assets.ContainerNames|Where-Object{$_-notin$expectedNames}).Count-eq0) "runtime inventory contains an unexpected container name for $($Slot.Project)"
  Assert-True (@($Assets.ContainerNames|Sort-Object -Unique).Count-eq$Assets.ContainerNames.Count) "runtime inventory contains duplicate container names for $($Slot.Project)"
  Assert-True (@($Assets.Volumes|Where-Object{$_-notin$expectedVolumes}).Count-eq0) "runtime inventory contains an unexpected volume for $($Slot.Project)"
  Assert-True (@($Assets.Networks|Where-Object{$_-notin$expectedNetworks}).Count-eq0) "runtime inventory contains an unexpected network for $($Slot.Project)"
}
function Assert-CompleteRunAssets($Slot,$Assets) {
  Assert-NoUnexpectedRunAssets $Slot $Assets
  Assert-True (Test-SameSet $Assets.ContainerServices @("mysql","redis")) "runtime container service set is incomplete for $($Slot.Project)"
  Assert-True (Test-SameSet $Assets.ContainerNames @("$($Slot.Project)-mysql-1","$($Slot.Project)-redis-1")) "runtime container name set is incomplete for $($Slot.Project)"
  Assert-True (Test-SameSet $Assets.Volumes @($Slot.MysqlVolume,$Slot.RedisVolume)) "runtime volume set is incomplete for $($Slot.Project)"
  Assert-True (Test-SameSet $Assets.Networks @($Slot.Network)) "runtime network set is incomplete for $($Slot.Project)"
}
function Register-CleanupInventory([ref]$Cleanup,$Slot,$Inventory,[bool]$RequireComplete) {
  Assert-NoUnexpectedRunAssets $Slot $Inventory
  if($Inventory.Count-gt0){$Cleanup.Value+=[pscustomobject]@{Slot=$Slot;Inventory=$Inventory}}
  if($RequireComplete){Assert-CompleteRunAssets $Slot $Inventory}
}
function Register-AttemptedSlot([ref]$AttemptedSlots,$Slot) {
  Assert-True(@($AttemptedSlots.Value|Where-Object Project -eq $Slot.Project).Count-eq0) "runtime slot was attempted more than once: $($Slot.Project)"
  $AttemptedSlots.Value+=,$Slot
}
function Invoke-InventoryFixtureTests {
  $longId=('a'*64);$networkId=('b'*64)
  $containerObjects=@(
    [pscustomobject]@{SourceRef=$longId.Substring(0,12);Id=$longId;Name='/fixture-project-mysql-1';Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}},
    [pscustomobject]@{SourceRef=$longId;Id=$longId;Name='/fixture-project-mysql-1';Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}}
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
  $cleanup=@();$incomplete=[pscustomobject]@{Containers=@($longId);ContainerServices=@("mysql");ContainerNames=@("fixture-project-mysql-1");Volumes=@();Networks=@();Count=1};$rejected=$false
  try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $incomplete $true}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq1)"fixture failed: incomplete verified inventory must be registered before complete-set rejection"
  $cleanup=@();$unexpected=[pscustomobject]@{Containers=@($longId);ContainerServices=@("unexpected");ContainerNames=@("fixture-project-mysql-1");Volumes=@();Networks=@();Count=1};$rejected=$false
  try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $unexpected $false}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq0)"fixture failed: unexpected inventory must never be registered for automatic cleanup"
  $duplicateServiceAssets=ConvertTo-CanonicalRunAssets @(
    [pscustomobject]@{Id=('c'*64);Name='/fixture-project-mysql-1';Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}},
    [pscustomobject]@{Id=('d'*64);Name='/fixture-project-mysql-2';Config=[pscustomobject]@{Labels=[pscustomobject]@{'com.docker.compose.service'='mysql'}}}
  ) @() @()
  $cleanup=@();$rejected=$false;try{Register-CleanupInventory ([ref]$cleanup) $fixtureSlot $duplicateServiceAssets $false}catch{$rejected=$true}
  Assert-True($rejected-and$cleanup.Count-eq0)"fixture failed: two container IDs for one service must be rejected without cleanup registration"
  $attempted=@();Register-AttemptedSlot ([ref]$attempted) $fixtureSlot
  Assert-True($attempted.Count-eq1-and$attempted[0].Project-eq$fixtureSlot.Project)"fixture failed: attempted runtime slot was not recorded"
  $rejected=$false;try{Register-AttemptedSlot ([ref]$attempted) $fixtureSlot}catch{$rejected=$true}
  Assert-True($rejected-and$attempted.Count-eq1)"fixture failed: duplicate runtime attempt was accepted"
}
function Assert-FixtureRejected([string]$Label,[scriptblock]$Action){$rejected=$false;try{&$Action}catch{$rejected=$true};Assert-True $rejected "fixture failed: $Label was accepted"}
function Invoke-CanarySafetyFixtureTests {
  $snapshot=[pscustomobject]@{RunHead=('a'*40);Paths=@('gate','compose');Blobs=@{gate=('b'*40);compose=('c'*40)}};$exact=[pscustomobject]@{Head=('a'*40);Dirty=$false;Blobs=@{gate=('b'*40);compose=('c'*40)}}
  Assert-FrozenSnapshotObservation $snapshot $exact 'fixture exact frozen candidate'
  Assert-FixtureRejected 'concurrent dirty/untracked edit after Gate' {Assert-FrozenSnapshotObservation $snapshot ([pscustomobject]@{Head=('a'*40);Dirty=$true;Blobs=$exact.Blobs}) 'fixture before up'}
  Assert-FixtureRejected 'HEAD switch after Gate' {Assert-FrozenSnapshotObservation $snapshot ([pscustomobject]@{Head=('d'*40);Dirty=$false;Blobs=$exact.Blobs}) 'fixture before up'}
  Assert-FixtureRejected 'critical blob switch after Gate' {Assert-FrozenSnapshotObservation $snapshot ([pscustomobject]@{Head=('a'*40);Dirty=$false;Blobs=@{gate=('e'*40);compose=('c'*40)}}) 'fixture before up'}
  # The same checks are mandatory after a command returns: a concurrent
  # writer/checkout during `compose up` must fail closed before its result is
  # used.  These are pure fixtures and do not invoke Docker.
  Assert-FixtureRejected 'concurrent dirty edit returned from compose' {Assert-FrozenSnapshotObservation $snapshot ([pscustomobject]@{Head=('a'*40);Dirty=$true;Blobs=$exact.Blobs}) 'fixture compose post-command'}
  Assert-FixtureRejected 'daemon switch returned from compose' {Assert-DockerBindingObservation ([pscustomobject]@{Context='xlb-local';Endpoint='npipe:////./pipe/docker_engine';EngineId='fixture-engine';BindingDigest=(Get-DockerBindingDigest 'xlb-local' 'npipe:////./pipe/docker_engine' 'fixture-engine')}) ([pscustomobject]@{ContextEndpoint='npipe:////./pipe/docker_other';EngineId='fixture-engine'}) 'fixture compose post-command'}
  $savedHost=$env:DOCKER_HOST;$savedContext=$env:DOCKER_CONTEXT
  try{
    $env:DOCKER_HOST=$null;$env:DOCKER_CONTEXT=$null;$binding=[pscustomobject]@{Context='xlb-local';Endpoint='npipe:////./pipe/docker_engine';EngineId='fixture-engine';BindingDigest=(Get-DockerBindingDigest 'xlb-local' 'npipe:////./pipe/docker_engine' 'fixture-engine')}
    Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint=$binding.Endpoint;EngineId=$binding.EngineId}) 'fixture exact daemon binding'
    $remote=[pscustomobject]@{Context='remote';Endpoint='tcp://example.invalid:2375';EngineId='remote-engine';BindingDigest=(Get-DockerBindingDigest 'remote' 'tcp://example.invalid:2375' 'remote-engine')};Assert-FixtureRejected 'remote Docker endpoint' {Assert-DockerBindingObservation $remote ([pscustomobject]@{ContextEndpoint=$remote.Endpoint;EngineId=$remote.EngineId}) 'fixture remote'}
    Assert-FixtureRejected 'Docker context endpoint switch' {Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint='npipe:////./pipe/other';EngineId=$binding.EngineId}) 'fixture context drift'}
    Assert-FixtureRejected 'Docker engine switch before mutation or cleanup' {Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint=$binding.Endpoint;EngineId='other-engine'}) 'fixture engine drift'}
    $env:DOCKER_HOST='tcp://example.invalid:2375';Assert-FixtureRejected 'ambient DOCKER_HOST override' {Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint=$binding.Endpoint;EngineId=$binding.EngineId}) 'fixture ambient host'};$env:DOCKER_HOST=$null
    $env:DOCKER_CONTEXT='other';Assert-FixtureRejected 'ambient DOCKER_CONTEXT override' {Assert-DockerBindingObservation $binding ([pscustomobject]@{ContextEndpoint=$binding.Endpoint;EngineId=$binding.EngineId}) 'fixture ambient context'}
  }finally{$env:DOCKER_HOST=$savedHost;$env:DOCKER_CONTEXT=$savedContext}
  $blob=('a'*40);$digest=Get-ManifestBlobDigest $blob
  Assert-True($digest-eq(Get-ManifestBlobDigest $blob.ToUpperInvariant()))"fixture failed: manifest blob digest is not canonical across OID casing"
  Assert-True($digest-ne(Get-ManifestBlobDigest ('b'*40)))"fixture failed: distinct manifest blob OIDs produced the same typed digest"
}
function Get-ValidatedRunAssets($Slot,[switch]$Cleanup) {
  $containerResult=Invoke-BoundDocker -Arguments @('ps','-aq','--filter',"label=com.docker.compose.project=$($Slot.Project)") -Stage "inventory containers $($Slot.Project)" -Cleanup:$Cleanup;$containerRefs=@($containerResult.Output);Assert-True($containerResult.ExitCode-eq0)"container inventory failed"
  foreach($name in @("$($Slot.Project)-mysql-1","$($Slot.Project)-redis-1","$($Slot.Project)_mysql_1","$($Slot.Project)_redis_1")){
    if(Test-DockerObject "container" $name -Cleanup:$Cleanup){$containerRefs+=,$name}
  }
  $volumeResult=Invoke-BoundDocker -Arguments @('volume','ls','-q','--filter',"label=com.docker.compose.project=$($Slot.Project)") -Stage "inventory volumes $($Slot.Project)" -Cleanup:$Cleanup;$volumeRefs=@($volumeResult.Output);Assert-True($volumeResult.ExitCode-eq0)"volume inventory failed"
  foreach($name in @($Slot.MysqlVolume,$Slot.RedisVolume)){if(Test-DockerObject "volume" $name -Cleanup:$Cleanup){$volumeRefs+=,$name}}
  $networkResult=Invoke-BoundDocker -Arguments @('network','ls','-q','--filter',"label=com.docker.compose.project=$($Slot.Project)") -Stage "inventory networks $($Slot.Project)" -Cleanup:$Cleanup;$networkRefs=@($networkResult.Output);Assert-True($networkResult.ExitCode-eq0)"network inventory failed"
  if(Test-DockerObject "network" $Slot.Network -Cleanup:$Cleanup){$networkRefs+=,$Slot.Network}
  $containerObjects=@();foreach($ref in @($containerRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$inspect=Invoke-BoundDocker -Arguments @('container','inspect',"$ref") -Stage "inspect container $ref" -Cleanup:$Cleanup;Assert-True($inspect.ExitCode-eq0)"container inspect failed";$obj=(($inspect.Output-join"`n")|ConvertFrom-Json)[0];Assert-Labels $obj.Config.Labels $Slot "container:$ref";Assert-True($obj.Config.Labels.'com.docker.compose.project'-eq$Slot.Project)"container project label mismatch";$containerObjects+=,$obj}
  $volumeObjects=@();foreach($ref in @($volumeRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$inspect=Invoke-BoundDocker -Arguments @('volume','inspect',"$ref") -Stage "inspect volume $ref" -Cleanup:$Cleanup;Assert-True($inspect.ExitCode-eq0)"volume inspect failed";$obj=(($inspect.Output-join"`n")|ConvertFrom-Json)[0];Assert-Labels $obj.Labels $Slot "volume:$ref";Assert-True($obj.Labels.'com.docker.compose.project'-eq$Slot.Project)"volume project label mismatch";$volumeObjects+=,$obj}
  $networkObjects=@();foreach($ref in @($networkRefs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}|Sort-Object -Unique)){$inspect=Invoke-BoundDocker -Arguments @('network','inspect',"$ref") -Stage "inspect network $ref" -Cleanup:$Cleanup;Assert-True($inspect.ExitCode-eq0)"network inspect failed";$obj=(($inspect.Output-join"`n")|ConvertFrom-Json)[0];Assert-Labels $obj.Labels $Slot "network:$ref";Assert-True($obj.Labels.'com.docker.compose.project'-eq$Slot.Project)"network project label mismatch";$networkObjects+=,$obj}
  return (ConvertTo-CanonicalRunAssets $containerObjects $volumeObjects $networkObjects)
}

function Invoke-Main {
  Invoke-InventoryFixtureTests
  Invoke-CanarySafetyFixtureTests
  if($RuntimeCanary){
    $script:FrozenSnapshot=New-FrozenSnapshot
    $script:FrozenComposeText=Read-GitText $script:FrozenSnapshot.RunHead 'governance/execution/templates/docker-compose.worktree.yml'
    Assert-CleanHeadFile $LeaseFile "managed-worktree Lease Ledger"
    Assert-CleanHeadFile $ComposeFile "managed-worktree canonical Compose template"
    Assert-CleanHeadFile $TrainRegistryFile "managed-worktree Train Registry"
    Assert-CleanHeadFile $BoundaryGateFile "managed-worktree boundary Gate"
    Assert-CleanHeadFile $PSCommandPath "managed-worktree Runtime Canary script"
  }
  Assert-True ($null-ne(Get-Command docker -ErrorAction SilentlyContinue)) "docker is required"
  if(-not$RuntimeCanary){& docker compose version *> $null;Assert-True($LASTEXITCODE-eq0)"docker compose is required"}
  & git -C $Root check-ignore -q --no-index -- ".env.worktree.local"
  Assert-True ($LASTEXITCODE-eq 0) ".env.worktree.local must be ignored by git"

  $registry=Read-ControlJson 'governance/execution/train-registry.json';$ledger=Read-ControlJson 'governance/execution/leases.json'
  Assert-True ([string]::Equals($registry.canonicalRoot,$Root,[StringComparison]::OrdinalIgnoreCase)) "registry canonical root mismatch"
  $trains=@($registry.trains|Where-Object trainId -eq $TrainId); Assert-True ($trains.Count-eq 1) "train must exist exactly once"
  $train=$trains[0]; Assert-True ($train.executionMode-eq "VALIDATION_ONLY") "only validation train is allowed"
  Assert-True ($train.humanApprovalStatus-ne "WAITING_HUMAN_APPROVAL") "train is not authorized"
  $refs=@($train.workUnitRefs); Assert-True ($refs.Count-eq 3) "validation train must reference exactly three manifests"
  $runtimeValues=[pscustomobject]@{CandidateCommit='STATIC_NOT_AUTHORIZED';RunHead='STATIC_NOT_AUTHORIZED';InputDigest='STATIC_NOT_AUTHORIZED';DockerEngineId='STATIC_NOT_AUTHORIZED';DockerBindingDigest='STATIC_NOT_AUTHORIZED'}
  if($RuntimeCanary){
    Assert-True($registry.executionSystemStatus-eq'ENABLED'-and$registry.enablementStatus-eq'ENABLED')"RuntimeCanary blocked: execution system must be ENABLED"
    Assert-True($train.status-eq'VALIDATION_AUTHORIZED'-and$train.runtimeCanaryAuthorized-eq$true-and$train.businessWriteAuthorized-eq$false)"RuntimeCanary blocked: validation Train authority is absent"
    $approvalRef="$($train.runtimeValidationApprovalRef)";$auditRef="$($train.runtimeValidationAuditRef)";Assert-True($approvalRef-match'^governance/execution/approvals/[^/]+\.json$'-and$auditRef-match'^governance/execution/evidence/[^/]+\.json$')"RuntimeCanary authority refs are noncanonical"
    $approval=Read-ControlJson $approvalRef;$audit=Read-ControlJson $auditRef
    foreach($field in @('candidateCommit','candidateDigest','candidateDigestAlgorithm','runtimeInputDigest','runtimeInputDigestAlgorithm','dockerContext','dockerEndpoint','dockerEngineId','dockerBindingDigest')){Assert-True("$($approval.$field)"-eq"$($audit.$field)")"Runtime approval/audit mismatch: $field"}
    Assert-True($approval.runtimeInputDigest-eq$script:FrozenSnapshot.RuntimeInputDigest-and$approval.runtimeInputDigestAlgorithm-eq'GIT_PATH_BLOB_SET_SHA256_V1')"Runtime input closure differs from approved frozen candidate"
    $binding=[pscustomobject]@{Context="$($approval.dockerContext)";Endpoint="$($approval.dockerEndpoint)";EngineId="$($approval.dockerEngineId)";BindingDigest="$($approval.dockerBindingDigest)"};Assert-DockerSelectorPolicy $binding
    $script:RuntimeAuthority=[pscustomobject]@{Approval=$approval;Audit=$audit;Binding=$binding}
    $runtimeValues=[pscustomobject]@{CandidateCommit="$($approval.candidateCommit)";RunHead=$script:FrozenSnapshot.RunHead;InputDigest=$script:FrozenSnapshot.RuntimeInputDigest;DockerEngineId=$binding.EngineId;DockerBindingDigest=$binding.BindingDigest}
    Assert-FrozenRunState 'before frozen Repository Gate'
    $frozenGateText=Read-GitText $script:FrozenSnapshot.RunHead 'scripts/check-managed-worktree-boundaries.ps1';$frozenGate=[scriptblock]::Create($frozenGateText)
    try{$authorityGate=@(& $frozenGate -Mode Repository -RepositoryRoot $Root -ExpectedHead $script:FrozenSnapshot.RunHead -SnapshotCommit $script:FrozenSnapshot.RunHead 2>&1)}catch{throw "RuntimeCanary blocked: frozen strict authority/evidence Repository Gate failed: $($_.Exception.Message)"}
    Assert-FrozenRunState 'after frozen Repository Gate'
    $script:RuntimeBinding=$script:RuntimeAuthority.Binding
    Assert-DockerBindingLive 'Runtime Canary daemon binding activation'
    $composeVersion=Invoke-BoundDocker -Arguments @('compose','version') -Stage 'Runtime Canary compose version';Assert-True($composeVersion.ExitCode-eq0)"docker compose is required on the approved Docker endpoint"
  }

  $slots=@(); $portNames=@("mysql","redis","backend","customer","worker","admin")
  foreach($ref in $refs){
    Assert-True ($ref-match'^governance/execution/work-units/[^/]+\.json$') "workUnitRef is outside canonical work-units: $ref"
    $path=[IO.Path]::GetFullPath((Join-Path $Root ($ref-replace '/', '\')));$manifest=Read-ControlJson $ref
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
    $manifestCommit=if($RuntimeCanary){$script:FrozenSnapshot.RunHead}else{'HEAD'};$digest=Get-ManifestBlobDigest (Get-GitBlob $manifestCommit $ref);$nonce=[Guid]::NewGuid().ToString("N")
    $slots += [pscustomobject]@{Slot=[string]$manifest.environment.slot;TrainId=$manifest.trainId;WorkUnitId=$manifest.workUnitId;Project=$manifest.environment.composeProject;Database=$manifest.environment.mysqlDatabase;RedisNamespace=$manifest.environment.redisNamespace;MysqlPort=[string]$manifest.environment.mysqlPort;RedisPort=[string]$manifest.environment.redisPort;BackendPort=[string]$manifest.environment.backendPort;CustomerPort=[string]$manifest.environment.customerPort;WorkerPort=[string]$manifest.environment.workerPort;AdminPort=[string]$manifest.environment.adminPort;BaseCommit=$manifest.baseCommit;EnvironmentLeaseId=$envLease.leaseId;ManifestDigest=$digest;RunNonce=$nonce;MysqlPassword="Xlb_${nonce}_pw";RootPassword="Xlb_${nonce}_root";MysqlVolume=$envLease.resources.mysqlVolume;RedisVolume=$envLease.resources.redisVolume;Network=$envLease.resources.network;RuntimeCandidateCommit=$runtimeValues.CandidateCommit;RuntimeHeadCommit=$runtimeValues.RunHead;RuntimeInputDigest=$runtimeValues.InputDigest;DockerEngineId=$runtimeValues.DockerEngineId;DockerBindingDigest=$runtimeValues.DockerBindingDigest}
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
  $listeners=[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
  foreach($slot in $slots){
    foreach($p in @($slot.MysqlPort,$slot.RedisPort,$slot.BackendPort,$slot.CustomerPort,$slot.WorkerPort,$slot.AdminPort)){Assert-True(-not($listeners-contains[int]$p))"port occupied: $p"}
    foreach($name in @("$($slot.Project)-mysql-1","$($slot.Project)-redis-1","$($slot.Project)_mysql_1","$($slot.Project)_redis_1")){Assert-True(-not(Test-DockerObject "container" $name))"old container exists: $name"}
    Assert-True(-not(Test-DockerObject "volume" $slot.MysqlVolume))"old volume exists";Assert-True(-not(Test-DockerObject "volume" $slot.RedisVolume))"old volume exists";Assert-True(-not(Test-DockerObject "network" $slot.Network))"old network exists"
    $byLabel=Invoke-BoundDocker -Arguments @('ps','-aq','--filter',"label=com.docker.compose.project=$($slot.Project)") -Stage "preflight containers $($slot.Project)";Assert-True($byLabel.ExitCode-eq0-and[string]::IsNullOrWhiteSpace(($byLabel.Output|Out-String)))"old project containers exist"
    $volumeByLabel=Invoke-BoundDocker -Arguments @('volume','ls','-q','--filter',"label=com.docker.compose.project=$($slot.Project)") -Stage "preflight volumes $($slot.Project)";Assert-True($volumeByLabel.ExitCode-eq0-and[string]::IsNullOrWhiteSpace(($volumeByLabel.Output|Out-String)))"old project volumes exist"
    $networkByLabel=Invoke-BoundDocker -Arguments @('network','ls','-q','--filter',"label=com.docker.compose.project=$($slot.Project)") -Stage "preflight networks $($slot.Project)";Assert-True($networkByLabel.ExitCode-eq0-and[string]::IsNullOrWhiteSpace(($networkByLabel.Output|Out-String)))"old project networks exist"
  }
  $cleanup=@();$attemptedSlots=@();$primary=$null;$cleanupFailures=@()
  try{
    foreach($slot in $slots){
      Register-AttemptedSlot ([ref]$attemptedSlots) $slot
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
    # Final attestation closes the last check/use window before reporting
    # success. Cleanup remains in the finally block and is fail-safe.
    Assert-FrozenRunState 'final runtime canary'
    Assert-DockerBindingLive 'final runtime canary'
    Write-Host "PASS managed worktree runtime canary"
  }catch{$primary=$_}finally{for($i=$cleanup.Count-1;$i-ge0;$i--){$entry=$cleanup[$i];$slot=$entry.Slot
    try{Assert-FrozenRunState "cleanup precondition $($slot.Project)"}catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: frozen candidate drift detected before cleanup: $($_.Exception.Message)"}
    $assets=$null;$inventoryVerified=$false
    try{
      $assets=Get-ValidatedRunAssets $slot -Cleanup
      Assert-True (Test-SameSet $assets.Containers $entry.Inventory.Containers) "container inventory changed after verification"
      Assert-True (Test-SameSet $assets.Volumes $entry.Inventory.Volumes) "volume inventory changed after verification"
      Assert-True (Test-SameSet $assets.Networks $entry.Inventory.Networks) "network inventory changed after verification"
      $inventoryVerified=$true
    }catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: cleanup inventory or approved Docker daemon binding changed: $($_.Exception.Message)"}
    if($inventoryVerified){
      foreach($id in $assets.Containers){try{$removed=Invoke-BoundDocker -Arguments @('container','rm','-f',"$id") -Stage "cleanup container $id" -Cleanup;Assert-True($removed.ExitCode-eq0)"container cleanup failed: $id"}catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: container $id cleanup failed: $($_.Exception.Message)"}}
      foreach($name in $assets.Volumes){try{$removed=Invoke-BoundDocker -Arguments @('volume','rm',"$name") -Stage "cleanup volume $name" -Cleanup;Assert-True($removed.ExitCode-eq0)"volume cleanup failed: $name"}catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: volume $name cleanup failed: $($_.Exception.Message)"}}
      foreach($name in $assets.Networks){try{$removed=Invoke-BoundDocker -Arguments @('network','rm',"$name") -Stage "cleanup network $name" -Cleanup;Assert-True($removed.ExitCode-eq0)"network cleanup failed: $name"}catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: network $name cleanup failed: $($_.Exception.Message)"}}
    }
  }
  # Every slot whose compose-up was attempted receives a final exact inventory,
  # including attempts that produced zero/partial/unverifiable inventory and
  # therefore never qualified for automatic cleanup.
  foreach($slot in $attemptedSlots){
    try{$remaining=Get-ValidatedRunAssets $slot -Cleanup;$remainingCount=@($remaining.Containers|Where-Object{-not[string]::IsNullOrWhiteSpace("$_")}).Count+@($remaining.Volumes|Where-Object{-not[string]::IsNullOrWhiteSpace("$_")}).Count+@($remaining.Networks|Where-Object{-not[string]::IsNullOrWhiteSpace("$_")}).Count;Assert-True($remainingCount-eq0)"final exact inventory contains residual containers, volumes, or networks"}
    catch{$cleanupFailures+="$($slot.Project): MANUAL_DISPOSITION_REQUIRED: final exact inventory could not prove zero residual assets on the approved daemon: $($_.Exception.Message)"}
  }}
  if($cleanupFailures.Count-gt0){throw "runtime cleanup failed: $($cleanupFailures-join'; ')"};if($null-ne$primary){throw $primary}
}

$rootBytes=[Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant());$sha=[Security.Cryptography.SHA256]::Create();$rootHash=(($sha.ComputeHash($rootBytes)|ForEach-Object{$_.ToString("x2")})-join"").Substring(0,24);$sha.Dispose()
$mutex=[Threading.Mutex]::new($false,"Global\XLB_MANAGED_WORKTREE_CONTROL_$rootHash");$acquired=$false
try{$acquired=$mutex.WaitOne(0);Assert-True $acquired "control-root mutex is already held";Invoke-Main}finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
