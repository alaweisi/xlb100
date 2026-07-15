param(
  [ValidateSet("Repository", "WorkUnit", "SelfTest")]
  [string]$Mode = "Repository",
  [string]$ManifestPath,
  [string]$WorktreePath,
  [string]$TargetRef = "HEAD",
  [string]$RepositoryRoot,
  [string]$ExpectedHead,
  [string]$SnapshotCommit
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = if([string]::IsNullOrWhiteSpace($RepositoryRoot)){(Resolve-Path (Join-Path $PSScriptRoot "..")).Path}else{(Resolve-Path -LiteralPath $RepositoryRoot).Path}
if(-not[string]::IsNullOrWhiteSpace($ExpectedHead)){
  if($ExpectedHead-notmatch'^[0-9a-fA-F]{40}$'){throw "[managed-worktree] FAIL ExpectedHead must be a full commit hash"}
  $actualHead=(&git -C $Root rev-parse HEAD 2>$null).Trim();if($LASTEXITCODE-ne0-or$actualHead-ne$ExpectedHead.ToLowerInvariant()){throw "[managed-worktree] FAIL Repository HEAD differs from ExpectedHead"}
}
if(-not[string]::IsNullOrWhiteSpace($SnapshotCommit)){
  if($Mode-ne"Repository"){throw "[managed-worktree] FAIL SnapshotCommit is only valid in Repository mode"}
  if($SnapshotCommit-notmatch'^[0-9a-fA-F]{40}$'){throw "[managed-worktree] FAIL SnapshotCommit must be a full commit hash"}
  $resolvedSnapshot=(&git -C $Root rev-parse "$SnapshotCommit^{commit}" 2>$null).Trim()
  if($LASTEXITCODE-ne0-or$resolvedSnapshot-ne$SnapshotCommit.ToLowerInvariant()){throw "[managed-worktree] FAIL SnapshotCommit does not resolve to itself"}
  if([string]::IsNullOrWhiteSpace($ExpectedHead)-or$SnapshotCommit.ToLowerInvariant()-ne$ExpectedHead.ToLowerInvariant()){throw "[managed-worktree] FAIL SnapshotCommit requires the identical ExpectedHead binding"}
  $script:ControlCommit=$resolvedSnapshot
}elseif($Mode-eq"WorkUnit"){
  $resolvedMain=(&git -C $Root rev-parse "refs/heads/main^{commit}" 2>$null).Trim()
  if($LASTEXITCODE-ne0-or$resolvedMain-notmatch'^[0-9a-fA-F]{40}$'){throw "[managed-worktree] FAIL canonical refs/heads/main control ref is missing"}
  $script:ControlCommit=$resolvedMain.ToLowerInvariant()
}else{$script:ControlCommit="HEAD"}
$ExecutionRoot = Join-Path $Root "governance/execution"
$WorkUnitsRoot = Join-Path $ExecutionRoot "work-units"
$LeasesPath = Join-Path $ExecutionRoot "leases.json"
$ReservationsPath = Join-Path $ExecutionRoot "migration-reservations.json"
$TrainRegistryPath = Join-Path $ExecutionRoot "train-registry.json"
$IntegrationQueuePath = Join-Path $ExecutionRoot "integration-queue.json"
$InactiveWorkUnitStatuses = @("CLOSED", "ABANDONED")
$InactiveLeaseStatuses = @("RELEASED", "EXPIRED", "CLOSED", "ABANDONED")
$InactiveReservationStatuses = @("MERGED", "ABANDONED")
$AllowedWorkUnitStatuses = @(
  "PLANNED", "WAITING_DEPENDENCY", "CONTRACT_FROZEN", "CONSTRUCTION_AUTHORIZED",
  "IN_CONSTRUCTION", "PACKAGE_VERIFIED", "PACKAGE_AUDITED", "QUEUED", "INTEGRATED",
  "CLOSED", "STALE", "BLOCKED", "ABANDONED"
)
$SerialCanonicalWriterRole = "SERIAL_CANONICAL_WRITER"
$AllowedSerialCanonicalWriterKeys = @("integration-queue-and-integration-branch")
$CanonicalWriterMinimumMap = [ordered]@{
  "shared-contract-types-validators-api-events" = @(
    "packages/types","packages/validators","packages/api-client","docs/contracts"
  )
  "canonical-shared-runtime" = @(
    "backend/src/app.ts","backend/src/server.ts","backend/src/order","backend/src/pricing","backend/src/payment",
    "backend/src/events","backend/src/dispatch","backend/src/fulfillment","backend/src/ledger","backend/src/settlement"
  )
  "migration-reservation-and-schema-ledger" = @(
    "db/migrations","db/dictionary","governance/execution/migration-reservations.json"
  )
  "integration-queue-and-integration-branch" = @(
    "governance/execution/integration-queue.json","package.json","pnpm-lock.yaml","pnpm-workspace.yaml","eslint.config.mjs",
    "tsconfig.base.json","turbo.json","vitest.config.ts","vitest.phase22.workspace.ts","vitest.workspace.ts",
    "packages/config/src/index.ts","packages/module-loader/src/index.ts","packages/ui/src/index.ts","scripts"
  )
  "current-state-phase-registry-lock-report-tag" = @(
    "AGENTS.md","governance/README.md","governance/01_PROJECT_CONSTITUTION_DRAFT.md",
    "governance/02_CURRENT_ENGINEERING_EXECUTION_MODEL.md","governance/03_GOVERNANCE_GAP_ANALYSIS.md",
    "governance/04_ADR_DECISION_ENGINE_DESIGN.md","governance/05_WORKTREE_INVESTIGATION_REPORT.md",
    "governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md","governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md",
    "governance/execution/README.md","governance/execution/train-registry.json","governance/execution/leases.json",
    "governance/execution/work-units","governance/execution/trains","governance/execution/templates",
    "governance/execution/evidence","governance/execution/approvals","governance/execution/transitions",
    "governance/execution/contracts","docs/CURRENT_STATE.md","docs/governance/phase-registry.json",
    ".cursor/skills",".cursor/rules","docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md",
    "docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md"
  )
}
$script:GitJsonCache=@{}
$script:StrictRecordCache=@{}

function Fail([string]$Message) {
  throw "[managed-worktree] FAIL $Message"
}

function Get-ControlCommit { return $script:ControlCommit }

function Get-ControlRepoPath([string]$Path,[string]$Label) {
  $full=[IO.Path]::GetFullPath($Path);$prefix=$Root.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
  if(-not$full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){Fail "$Label is outside canonical repository root: $Path"}
  return Normalize-RepoPath ($full.Substring($prefix.Length).Replace('\','/')) $Label
}

function Test-ControlLeaf([string]$Path) {
  if($script:ControlCommit-eq"HEAD"){return Test-Path -LiteralPath $Path -PathType Leaf}
  $ref=Get-ControlRepoPath $Path "immutable snapshot path"
  $entries=@(Invoke-Git $Root @("ls-tree",$script:ControlCommit,"--",$ref))
  return $entries.Count-eq1-and$entries[0]-match'^\d+ blob [0-9a-f]+\s'
}

function Test-ControlDirectory([string]$Path) {
  if($script:ControlCommit-eq"HEAD"){return Test-Path -LiteralPath $Path -PathType Container}
  $ref=Get-ControlRepoPath $Path "immutable snapshot directory"
  return @(Invoke-Git $Root @("ls-tree","-r","--name-only",$script:ControlCommit,"--",$ref)).Count-gt0
}

function Read-ControlText([string]$Path,[string]$Label) {
  if($script:ControlCommit-eq"HEAD"){return Get-Content -LiteralPath $Path -Raw -Encoding UTF8}
  $ref=Get-ControlRepoPath $Path $Label
  $output=@(&git -C $Root show "$($script:ControlCommit)`:$ref" 2>&1)
  if($LASTEXITCODE-ne0){Fail "$Label is missing from immutable snapshot $($script:ControlCommit): $ref"}
  return $output-join"`n"
}

function Get-ControlFileSha256([string]$Path,[string]$Label) {
  if($script:ControlCommit-eq"HEAD"){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
  $ref=Get-ControlRepoPath $Path $Label
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName="git.exe";$psi.Arguments="-C `"$Root`" cat-file blob `"$($script:ControlCommit):$ref`""
  $psi.UseShellExecute=$false;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.CreateNoWindow=$true
  $process=New-Object Diagnostics.Process;$process.StartInfo=$psi
  if(-not$process.Start()){Fail "cannot start immutable blob reader for $Label"}
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=$sha.ComputeHash($process.StandardOutput.BaseStream);$stderr=$process.StandardError.ReadToEnd();$process.WaitForExit();if($process.ExitCode-ne0){Fail "cannot read immutable blob for $Label ($stderr)"};return ([BitConverter]::ToString($hash)).Replace('-','').ToLowerInvariant()}
  finally{$sha.Dispose();$process.Dispose()}
}

function Get-ControlFileRefs([string]$Prefix) {
  $normalized=Normalize-RepoPath $Prefix "immutable snapshot prefix"
  if($script:ControlCommit-ne"HEAD"){return @(Invoke-Git $Root @("ls-tree","-r","--name-only",$script:ControlCommit,"--",$normalized))}
  $full=Join-Path $Root $normalized
  if(-not(Test-Path -LiteralPath $full)){return @()}
  if(Test-Path -LiteralPath $full -PathType Leaf){return @($normalized)}
  return @(Get-ChildItem -LiteralPath $full -Recurse -Force -File|ForEach-Object{$_.FullName.Substring($Root.Length).TrimStart('\','/').Replace('\','/')})
}

function Invoke-WithRepositoryRoot([string]$RepositoryRoot, [scriptblock]$Action) {
  $previous = @{
    Root=$script:Root;ExecutionRoot=$script:ExecutionRoot;WorkUnitsRoot=$script:WorkUnitsRoot;LeasesPath=$script:LeasesPath
    ReservationsPath=$script:ReservationsPath;TrainRegistryPath=$script:TrainRegistryPath;IntegrationQueuePath=$script:IntegrationQueuePath
  }
  try {
    $script:Root = [IO.Path]::GetFullPath($RepositoryRoot)
    $script:ExecutionRoot = Join-Path $script:Root "governance/execution"
    $script:WorkUnitsRoot = Join-Path $script:ExecutionRoot "work-units"
    $script:LeasesPath = Join-Path $script:ExecutionRoot "leases.json"
    $script:ReservationsPath = Join-Path $script:ExecutionRoot "migration-reservations.json"
    $script:TrainRegistryPath = Join-Path $script:ExecutionRoot "train-registry.json"
    $script:IntegrationQueuePath = Join-Path $script:ExecutionRoot "integration-queue.json"
    return & $Action
  }
  finally {
    $script:Root=$previous.Root;$script:ExecutionRoot=$previous.ExecutionRoot;$script:WorkUnitsRoot=$previous.WorkUnitsRoot;$script:LeasesPath=$previous.LeasesPath
    $script:ReservationsPath=$previous.ReservationsPath;$script:TrainRegistryPath=$previous.TrainRegistryPath;$script:IntegrationQueuePath=$previous.IntegrationQueuePath
  }
}

function Assert-NoDuplicateJsonKeys([string]$Text, [string]$Label) {
  $stack = New-Object System.Collections.Stack
  for ($index = 0; $index -lt $Text.Length; $index++) {
    $character = $Text[$index]
    if ($character -eq '"') {
      $start = $index
      $index++
      while ($index -lt $Text.Length) {
        if ($Text[$index] -eq '\') { $index += 2; continue }
        if ($Text[$index] -eq '"') { break }
        $index++
      }
      if ($index -ge $Text.Length) { return }
      $next = $index + 1
      while ($next -lt $Text.Length -and [char]::IsWhiteSpace($Text[$next])) { $next++ }
      if ($next -lt $Text.Length -and $Text[$next] -eq ':' -and $stack.Count -gt 0 -and $stack.Peek().Kind -eq "OBJECT") {
        $literal = $Text.Substring($start, $index - $start + 1)
        $key = "$($literal | ConvertFrom-Json)"
        if (-not $stack.Peek().Keys.Add($key)) { Fail "$Label contains duplicate JSON key '$key'" }
      }
      continue
    }
    if ($character -eq '{') {
      $keys = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
      $stack.Push([pscustomobject]@{ Kind="OBJECT"; Keys=$keys })
    } elseif ($character -eq '[') {
      $stack.Push([pscustomobject]@{ Kind="ARRAY"; Keys=$null })
    } elseif ($character -eq '}' -or $character -eq ']') {
      if ($stack.Count -gt 0) { $null = $stack.Pop() }
    }
  }
}

function Assert-AllowedFields($Object, [string[]]$Allowed, [string]$Label) {
  if ($null -eq $Object) { Fail "$Label must be a JSON object" }
  $set = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  foreach ($field in $Allowed) { $null = $set.Add($field) }
  foreach ($property in @($Object.PSObject.Properties)) {
    if (-not $set.Contains($property.Name)) { Fail "$Label contains unsupported field '$($property.Name)' (additionalProperties=false)" }
  }
}

function Read-Json([string]$Path, [string]$Label) {
  if (-not (Test-ControlLeaf $Path)) {
    Fail "missing $Label at $Path"
  }
  try {
    $text = Read-ControlText $Path $Label
    Assert-NoDuplicateJsonKeys $text $Label
    return $text | ConvertFrom-Json
  } catch {
    Fail "$Label is not valid JSON: $Path ($($_.Exception.Message))"
  }
}

function Read-GitJson([string]$Commit, [string]$RepoPath, [string]$Label) {
  $normalized = Normalize-RepoPath $RepoPath $Label
  $resolvedCommit=$Commit
  if($resolvedCommit-notmatch'^[0-9a-fA-F]{40}$'){$resolvedCommit=(Invoke-Git $Root @("rev-parse","$Commit^{commit}")|Select-Object -First 1).Trim()}
  $cacheKey="$script:Root|$resolvedCommit|$normalized".ToLowerInvariant();if($script:GitJsonCache.ContainsKey($cacheKey)){return $script:GitJsonCache[$cacheKey]}
  $output = @(& git -C $Root show "$resolvedCommit`:$normalized" 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "$Label is missing from immutable commit $resolvedCommit`: $normalized" }
  try {
    $text = $output -join "`n"
    Assert-NoDuplicateJsonKeys $text $Label
    $value=$text | ConvertFrom-Json;$script:GitJsonCache[$cacheKey]=$value;return $value
  } catch {
    Fail "$Label is not valid JSON in immutable commit $resolvedCommit`: $normalized ($($_.Exception.Message))"
  }
}

function Get-HistoryStatusSubject($Document,[string]$SubjectType,[string]$SubjectId,[string]$TrainId="",[string]$WorkUnitId="") {
  if ($null -eq $Document) { return $null }
  $subject = switch ($SubjectType) {
    "EXECUTION_SYSTEM" { $Document; break }
    "INTEGRATION_QUEUE" { $Document; break }
    "RELEASE_TRAIN" { @($Document.trains|Where-Object{"$($_.trainId)"-eq$SubjectId})|Select-Object -First 1; break }
    "WORK_UNIT" { if("$($Document.workUnitId)"-eq$SubjectId){$Document}else{$null}; break }
    "QUEUE_ITEM" {
      $parts=$SubjectId-split'/';if($parts.Count-ne3){$null}else{@($Document.items|Where-Object{"$($_.trainId)"-eq$parts[0]-and"$($_.workUnitId)"-eq$parts[1]-and"$($_.sequence)"-eq$parts[2]})|Select-Object -First 1};break
    }
    default { Fail "unsupported history subject type $SubjectType" }
  }
  if($null-eq$subject){return $null}
  if($SubjectType-eq"EXECUTION_SYSTEM"){
    return [pscustomobject]@{Status="$(Require-Text $subject 'executionSystemStatus' 'history Registry')/$(Require-Text $subject 'enablementStatus' 'history Registry')";Previous="$(Require-Text $subject 'previousExecutionSystemStatus' 'history Registry')/$(Require-Text $subject 'previousEnablementStatus' 'history Registry')";ChangedAt=Require-Text $subject 'statusChangedAt' 'history Registry';AuthorityRef=Require-Text $subject 'transitionAuthorityRef' 'history Registry';Subject=$subject}
  }
  if($SubjectType-eq"INTEGRATION_QUEUE"){
    return [pscustomobject]@{Status=Require-Text $subject 'enablementStatus' 'history Queue';Previous=Require-Text $subject 'previousEnablementStatus' 'history Queue';ChangedAt=Require-Text $subject 'statusChangedAt' 'history Queue';AuthorityRef=Require-Text $subject 'transitionAuthorityRef' 'history Queue';Subject=$subject}
  }
  return [pscustomobject]@{Status=Require-Text $subject 'status' "history $SubjectType";Previous=Require-Text $subject 'previousStatus' "history $SubjectType";ChangedAt=Require-Text $subject 'statusChangedAt' "history $SubjectType";AuthorityRef=Require-Text $subject 'transitionAuthorityRef' "history $SubjectType";Subject=$subject}
}

function Get-HistoryStatusSnapshotAtCommit([string]$Commit,[string]$RepoPath,[string]$SubjectType,[string]$SubjectId,[string]$TrainId="",[string]$WorkUnitId="") {
  if(@(Invoke-Git $Root @("ls-tree",$Commit,"--",$RepoPath)).Count-eq0){return $null}
  return Get-HistoryStatusSubject (Read-GitJson $Commit $RepoPath "status DAG history") $SubjectType $SubjectId $TrainId $WorkUnitId
}

function Get-HistorySubjectClosure($Snapshot,[string]$SubjectType) {
  if($null-eq$Snapshot){return $null}
  if($SubjectType-in@("RELEASE_TRAIN","WORK_UNIT","QUEUE_ITEM")){return $Snapshot.Subject}
  $excluded=if($SubjectType-eq"EXECUTION_SYSTEM"){@("updatedAt","trains")}else{@("updatedAt","items","nextSequence","acceptingItems")}
  $projection=[ordered]@{};foreach($property in $Snapshot.Subject.PSObject.Properties){if($property.Name-notin$excluded){$projection[$property.Name]=$property.Value}}
  return $projection
}

function Test-HistoryEpoch($Snapshot,[string]$Current,[string]$Previous,[string]$ChangedAt,[string]$AuthorityRef) {
  return $null-ne$Snapshot-and"$($Snapshot.Status)"-eq$Current-and"$($Snapshot.Previous)"-eq$Previous-and"$($Snapshot.ChangedAt)"-eq$ChangedAt-and"$($Snapshot.AuthorityRef)"-eq$AuthorityRef
}

function Assert-StrictActivationBaseline([string]$Commit){
  $registry=Read-GitJson $Commit "governance/execution/train-registry.json" "activation baseline Train Registry";$queue=Read-GitJson $Commit "governance/execution/integration-queue.json" "activation baseline Integration Queue";$leases=Read-GitJson $Commit "governance/execution/leases.json" "activation baseline leases";$reservations=Read-GitJson $Commit "governance/execution/migration-reservations.json" "activation baseline reservations"
  if((Require-Text $registry "executionSystemStatus" "activation baseline")-ne"BOOTSTRAP"-or(Require-Text $registry "enablementStatus" "activation baseline")-ne"NOT_ENABLED"){Fail "activation baseline must be BOOTSTRAP/NOT_ENABLED"}
  if((Require-Text $registry "previousExecutionSystemStatus" "activation baseline")-ne"NONE"-or(Require-Text $registry "previousEnablementStatus" "activation baseline")-ne"NONE"){Fail "activation baseline execution previous status must be NONE/NONE"}
  foreach($anchor in @("enablementApprovalRef","auditedCandidateCommit","independentAuditRef","humanConfirmationRef","authorityEnvelopeCommit","enablementApprovalDigest","independentAuditDigest","humanConfirmationDigest")){if((Require-Text $registry $anchor "activation baseline")-ne"PENDING"){Fail "activation baseline anchor $anchor must be PENDING"}}
  $bootstrapRef=Require-Text $registry "transitionAuthorityRef" "activation baseline";Assert-TransitionAuthorityRecord $bootstrapRef "EXECUTION_SYSTEM" "GLOBAL_EXECUTION_SYSTEM" "NONE/NONE" "BOOTSTRAP/NOT_ENABLED" (Require-Text $registry "statusChangedAt" "activation baseline") "activation baseline bootstrap transition" "" "" $Commit
  if((Require-Text $queue "executionSystemStatus" "activation baseline queue")-ne"BOOTSTRAP" -or (Require-Text $queue "enablementStatus" "activation baseline queue")-ne"NOT_ENABLED" -or (Require-Text $queue "previousEnablementStatus" "activation baseline queue")-ne"NONE"){Fail "activation baseline queue must be NOT_ENABLED"}
  if((Get-OptionalValue $queue "acceptingItems")-ne$false -or @(Get-Array $queue "items").Count-ne0){Fail "activation baseline queue must be closed and empty"}
  Assert-TransitionAuthorityRecord (Require-Text $queue "transitionAuthorityRef" "activation baseline queue") "INTEGRATION_QUEUE" "INTEGRATION_QUEUE" "NONE" "NOT_ENABLED" (Require-Text $queue "statusChangedAt" "activation baseline queue") "activation baseline queue transition" "" "" $Commit
  foreach($train in @(Get-LedgerItems $registry "trains" "activation baseline trains")){
    $trainId=Require-Text $train "trainId" "activation baseline Train";$status=(Require-Text $train "status" "activation baseline Train").ToUpperInvariant();if($status-notin@("PLANNED","DRAFT")){Fail "activation baseline Train may only be PLANNED or DRAFT"};if((Require-Text $train "previousStatus" "activation baseline Train")-ne"NONE"){Fail "activation baseline Train $trainId previousStatus must be NONE"};$trainTime=Require-Text $train "statusChangedAt" "activation baseline Train";$null=[DateTimeOffset]::Parse($trainTime);Assert-TransitionAuthorityRecord (Require-Text $train "transitionAuthorityRef" "activation baseline Train") "RELEASE_TRAIN" $trainId "NONE" $status $trainTime "activation baseline Train transition" $trainId "" $Commit;foreach($field in @("businessWriteAuthorized","mainMergeAuthorized","lockAuthorized","productionAuthorized","runtimeCanaryAuthorized")){if((Get-OptionalValue $train $field)-eq$true){Fail "activation baseline Train $trainId has enabled authority flag $field"}};foreach($field in @("approvalRef","runtimeValidationApprovalRef","runtimeValidationAuditRef","contractAuthorityRef","frozenContractRevision","contractProtectedPathsDigest")){if((Get-OptionalValue $train $field)-notin@($null,"PENDING")){Fail "activation baseline Train $trainId authority $field must be PENDING"}}
  }
  $baselineLeaseEntries=@(Get-LedgerItems $leases "leases" "activation baseline leases");$leaseById=@{}
  foreach($lease in $baselineLeaseEntries){$id=(Require-Text $lease "leaseId" "activation baseline lease").ToLowerInvariant();if($leaseById.ContainsKey($id)){Fail "activation baseline has duplicate leaseId $id"};$leaseById[$id]=$lease}
  $allowedActive=@{};$baselineWus=@(Invoke-Git $Root @("ls-tree","-r","--name-only",$Commit,"governance/execution/work-units")|ForEach-Object{Read-GitJson $Commit $_ "activation baseline Work Unit"})
  foreach($wu in $baselineWus){
    $wuId=Require-Text $wu "workUnitId" "activation baseline Work Unit";$trainId=Require-Text $wu "trainId" "activation baseline Work Unit"
    if((Require-Text $wu "status" "activation baseline Work Unit")-ne"PLANNED"-or(Require-Text $wu "executionMode" "activation baseline Work Unit")-ne"VALIDATION_ONLY"){continue}
    $identity="$trainId/$wuId";$refs=Get-OptionalValue $wu "leaseRefs";if($null-eq$refs){Fail "activation baseline Work Unit $wuId is missing leaseRefs"}
    $environment=Get-OptionalValue $wu "environment";if($null-eq$environment){Fail "activation baseline Work Unit $wuId is missing environment"}
    $expected=@(
      [pscustomobject]@{Id=(Require-Text $refs "worktreePath" "activation baseline leaseRefs");Type="WORKTREE_PATH"},
      [pscustomobject]@{Id=(Require-Text $refs "sourcePath" "activation baseline leaseRefs");Type="SOURCE_PATH"},
      [pscustomobject]@{Id=(Require-Text $refs "environment" "activation baseline leaseRefs");Type="ENVIRONMENT"}
    )
    foreach($binding in $expected){$id=$binding.Id.ToLowerInvariant();if(-not$leaseById.ContainsKey($id)){Fail "activation baseline Work Unit $wuId references missing active $($binding.Type) lease $id"};$lease=$leaseById[$id];if((Require-Text $lease "status" "activation baseline lease $id").ToUpperInvariant()-ne"ACTIVE"-or(Require-Text $lease "type" "activation baseline lease $id").ToUpperInvariant()-ne$binding.Type-or(Require-Text $lease "trainId" "activation baseline lease $id")-ne$trainId-or(Require-Text $lease "workUnitId" "activation baseline lease $id")-ne$wuId){Fail "activation baseline lease $id does not exactly bind $identity as $($binding.Type)"};$allowedActive[$id]=$true}
    $worktreeLease=$leaseById[$expected[0].Id.ToLowerInvariant()];$declaredWorktree=(Require-Text $wu "worktreePath" "activation baseline Work Unit").Replace('\','/').TrimEnd('/');$leasedWorktree=(Require-Text $worktreeLease "key" "activation baseline WORKTREE_PATH lease").Replace('\','/').TrimEnd('/');if(-not$leasedWorktree.Equals($declaredWorktree,[StringComparison]::OrdinalIgnoreCase)){Fail "activation baseline WORKTREE_PATH key differs from Work Unit $wuId worktreePath"}
    $sourceLease=$leaseById[$expected[1].Id.ToLowerInvariant()];$allowedPaths=@(Get-Array $wu "allowedPaths"|ForEach-Object{Normalize-RepoPath "$_" "activation baseline allowedPaths"}|Sort-Object);$sourcePaths=@(Require-ArrayField $sourceLease "paths" "activation baseline SOURCE_PATH lease"|ForEach-Object{Normalize-RepoPath "$_" "activation baseline SOURCE_PATH paths"}|Sort-Object);if(@(Compare-Object $allowedPaths $sourcePaths).Count){Fail "activation baseline SOURCE_PATH paths differ from Work Unit $wuId allowedPaths"};if($allowedPaths.Count-ne0-or(Require-Text $sourceLease "key" "activation baseline SOURCE_PATH lease")-cne"NO_SOURCE_WRITE::$wuId"){Fail "activation baseline VALIDATION_ONLY Work Unit $wuId must use its exact no-source-write lease key"}
    $environmentLease=$leaseById[$expected[2].Id.ToLowerInvariant()];$resources=Get-OptionalValue $environmentLease "resources";if($null-eq$resources){Fail "activation baseline ENVIRONMENT lease for $wuId is missing resources"};$project=Require-Text $environment "composeProject" "activation baseline environment";if((Require-Text $environmentLease "key" "activation baseline ENVIRONMENT lease")-cne$project){Fail "activation baseline ENVIRONMENT key differs from Work Unit $wuId composeProject"};$expectedResources=[ordered]@{composeProject=$project;mysqlDatabase=(Require-Text $environment "mysqlDatabase" "activation baseline environment");redisNamespace=(Require-Text $environment "redisNamespace" "activation baseline environment");mysqlVolume="${project}_mysql-data";redisVolume="${project}_redis-data";network="${project}_worktree"};foreach($field in $expectedResources.Keys){if((Require-Text $resources $field "activation baseline ENVIRONMENT resources")-cne$expectedResources[$field]){Fail "activation baseline ENVIRONMENT resource $field differs from Work Unit $wuId"}}
    $portRefs=Get-OptionalValue $refs "ports";if($null-eq$portRefs){Fail "activation baseline Work Unit $wuId is missing leaseRefs.ports"};foreach($portName in @("mysql","redis","backend","customer","worker","admin")){$id=(Require-Text $portRefs $portName "activation baseline leaseRefs.ports").ToLowerInvariant();if(-not$leaseById.ContainsKey($id)){Fail "activation baseline Work Unit $wuId references missing PORT lease $id"};$lease=$leaseById[$id];$field="${portName}Port";$port=[int](Require-Text $environment $field "activation baseline environment");if((Require-Text $lease "status" "activation baseline PORT lease").ToUpperInvariant()-ne"ACTIVE"-or(Require-Text $lease "type" "activation baseline PORT lease").ToUpperInvariant()-ne"PORT"-or(Require-Text $lease "trainId" "activation baseline PORT lease")-ne$trainId-or(Require-Text $lease "workUnitId" "activation baseline PORT lease")-ne$wuId-or(Require-Text $lease "portName" "activation baseline PORT lease").ToLowerInvariant()-ne$portName-or[int](Require-Text $lease "port" "activation baseline PORT lease")-ne$port-or(Require-Text $lease "key" "activation baseline PORT lease")-cne"tcp:127.0.0.1:$port"){Fail "activation baseline PORT lease $id does not exactly bind $identity/$portName"};$allowedActive[$id]=$true}
    $semanticKeys=@(Require-ArrayField $wu "semanticOwnership" "activation baseline Work Unit $wuId" $true|ForEach-Object{"$_".ToLowerInvariant()});foreach($semantic in $semanticKeys){$matches=@($baselineLeaseEntries|Where-Object{(Require-Text $_ "status" "activation baseline semantic lease").ToUpperInvariant()-eq"ACTIVE"-and(Require-Text $_ "type" "activation baseline semantic lease").ToUpperInvariant()-eq"SEMANTIC"-and(Require-Text $_ "key" "activation baseline semantic lease").ToLowerInvariant()-eq$semantic-and(Require-Text $_ "trainId" "activation baseline semantic lease")-eq$trainId-and(Require-Text $_ "workUnitId" "activation baseline semantic lease")-eq$wuId});if($matches.Count-ne1){Fail "activation baseline semanticOwnership $semantic must bind exactly one active SEMANTIC lease for $identity"};$allowedActive[(Require-Text $matches[0] "leaseId" "activation baseline semantic lease").ToLowerInvariant()]=$true}
  }
  $serialOwners=[ordered]@{"shared-contract-types-validators-api-events"="CONTRACT-OWNER";"canonical-shared-runtime"="DOMAIN-AND-INTEGRATION-OWNER";"migration-reservation-and-schema-ledger"="MIGRATION-OWNER";"integration-queue-and-integration-branch"="INTEGRATION-OWNER";"current-state-phase-registry-lock-report-tag"="LOCK-FLOW"};$serialActive=@($baselineLeaseEntries|Where-Object{(Require-Text $_ "status" "activation baseline lease").ToUpperInvariant()-eq"ACTIVE"-and((Require-Text $_ "type" "activation baseline lease").ToUpperInvariant()-eq"CANONICAL_WRITER"-or(Require-Text $_ "trainId" "activation baseline lease")-eq"SYSTEM-SERIAL-LANES")});if($serialActive.Count-ne5){Fail "activation baseline must contain exactly five active SYSTEM-SERIAL-LANES CANONICAL_WRITER leases"}
  foreach($key in $serialOwners.Keys){$matches=@($serialActive|Where-Object{(Require-Text $_ "type" "activation baseline serial lease").ToUpperInvariant()-eq"CANONICAL_WRITER"-and(Require-Text $_ "trainId" "activation baseline serial lease")-eq"SYSTEM-SERIAL-LANES"-and(Require-Text $_ "key" "activation baseline serial lease")-eq$key-and(Require-Text $_ "workUnitId" "activation baseline serial lease")-eq$serialOwners[$key]});if($matches.Count-ne1){Fail "activation baseline requires the unique fixed SYSTEM-SERIAL-LANES CANONICAL_WRITER $key"};$paths=@(Require-ArrayField $matches[0] "protectedPaths" "activation baseline CANONICAL_WRITER $key" $true|ForEach-Object{Normalize-RepoPath "$_" "activation baseline CANONICAL_WRITER paths"}|Sort-Object -Unique);$required=@($CanonicalWriterMinimumMap[$key]|Sort-Object -Unique);if(@(Compare-Object $paths $required).Count){Fail "activation baseline CANONICAL_WRITER $key protectedPaths differ from the fixed serial lane"};$allowedActive[(Require-Text $matches[0] "leaseId" "activation baseline serial lease").ToLowerInvariant()]=$true}
  foreach($lease in $baselineLeaseEntries){if((Require-Text $lease "status" "activation baseline lease").ToUpperInvariant()-ne"ACTIVE"){continue};$id=(Require-Text $lease "leaseId" "activation baseline lease").ToLowerInvariant();if(-not$allowedActive.ContainsKey($id)){Fail "activation baseline contains extra, orphan, conflicting, or unauthorized active lease $id"}}
  foreach($reservation in @(Get-LedgerItems $reservations "reservations" "activation baseline reservations")){if((Require-Text $reservation "status" "activation baseline reservation").ToUpperInvariant() -in@("RESERVED","MATERIALIZED")){Fail "activation baseline may not contain active reservation $($reservation.number)"}}
  foreach($path in @(Invoke-Git $Root @("ls-tree","-r","--name-only",$Commit,"governance/execution/work-units"))){$wu=Read-GitJson $Commit $path "activation baseline Work Unit";$wuId=Require-Text $wu "workUnitId" "activation baseline Work Unit";$status=(Require-Text $wu "status" "activation baseline Work Unit").ToUpperInvariant();if($status-ne"PLANNED"){Fail "activation baseline Work Unit $wuId must be PLANNED"};if((Require-Text $wu "previousStatus" "activation baseline Work Unit")-ne"NONE"){Fail "activation baseline Work Unit $wuId previousStatus must be NONE"};$wuTime=Require-Text $wu "statusChangedAt" "activation baseline Work Unit";$null=[DateTimeOffset]::Parse($wuTime);Assert-TransitionAuthorityRecord (Require-Text $wu "transitionAuthorityRef" "activation baseline Work Unit") "WORK_UNIT" $wuId "NONE" "PLANNED" $wuTime "activation baseline Work Unit transition" (Require-Text $wu "trainId" "activation baseline Work Unit") $wuId $Commit;foreach($field in @("businessWriteAuthorized","mainMergeAuthorized","lockAuthorized","productionAuthorized")){if((Get-OptionalValue $wu $field)-eq$true){Fail "activation baseline Work Unit $wuId has enabled authority flag $field"}}}
}

function Get-HistoryCarryForwardFields([string]$SubjectType,[string]$Previous,[string]$Current) {
  if($SubjectType-eq"RELEASE_TRAIN"){
    if((($Previous-in@("CHARTER_HUMAN_APPROVED","ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED"))-and($Current-in@("ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")))-or($Previous-eq"VALIDATION_AUTHORIZED"-and$Current-in@("TRAIN_VERIFIED","BLOCKED","ABANDONED"))){
      return @("approvalRef","humanApprovalStatus","runtimeValidationApprovalRef","runtimeValidationAuditRef")
    }
    return @()
  }
  if($SubjectType-ne"WORK_UNIT"){return @()}
  $evidence=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","candidateRecordRef","baseCommit","contractRevision","environmentDigest","evidenceRefs","evidenceBindings")
  $audit=@($evidence+@("auditRefs","auditBindings"))
  if($Previous-eq"PACKAGE_VERIFIED"-and$Current-in@("PACKAGE_AUDITED","STALE","BLOCKED")){return $evidence}
  if($Previous-in@("PACKAGE_AUDITED","QUEUED","INTEGRATED")-and$Current-in@("QUEUED","INTEGRATED","CLOSED","STALE","BLOCKED")){return $audit}
  if($Previous-in@("STALE","BLOCKED")-and$Current-eq"ABANDONED"){return $audit}
  return @()
}

function Assert-HistoryLegalStatusEdge([string]$SubjectType,[string]$Previous,[string]$Current,[string]$Label,[string]$ExecutionMode=""){
  $ExecutionMode=$ExecutionMode.ToUpperInvariant()
  $transitions=switch($SubjectType){
    "EXECUTION_SYSTEM"{@{"BOOTSTRAP/NOT_ENABLED"=@("ENABLED/ENABLED");"ENABLED/ENABLED"=@("DISABLED/DISABLED");"DISABLED/DISABLED"=@("ENABLED/ENABLED")};break}
    "INTEGRATION_QUEUE"{@{NOT_ENABLED=@("ENABLED");ENABLED=@("DISABLED");DISABLED=@("ENABLED")};break}
    "RELEASE_TRAIN"{
      if($ExecutionMode-eq"VALIDATION_ONLY"){@{PLANNED=@("VALIDATION_AUTHORIZED");VALIDATION_AUTHORIZED=@("TRAIN_VERIFIED");TRAIN_VERIFIED=@()}}
      elseif($ExecutionMode-eq"BUSINESS_CONSTRUCTION"){@{DRAFT=@("CHARTER_HUMAN_APPROVED","BLOCKED","ABANDONED");CHARTER_HUMAN_APPROVED=@("ASSEMBLING","BLOCKED","ABANDONED");ASSEMBLING=@("TRAIN_VERIFIED","BLOCKED");TRAIN_VERIFIED=@("HUMAN_ACCEPTED","BLOCKED");HUMAN_ACCEPTED=@("PHASE_LOCKS_COMPLETED");PHASE_LOCKS_COMPLETED=@("CLOSED");BLOCKED=@("DRAFT","ABANDONED");CLOSED=@();ABANDONED=@()}}
      else{Fail "$Label has unsupported or missing Release Train executionMode $ExecutionMode"}
      break
    }
    "WORK_UNIT"{@{PLANNED=@("WAITING_DEPENDENCY","CONTRACT_FROZEN","BLOCKED","ABANDONED");WAITING_DEPENDENCY=@("CONTRACT_FROZEN","BLOCKED","ABANDONED");CONTRACT_FROZEN=@("CONSTRUCTION_AUTHORIZED","BLOCKED","ABANDONED");CONSTRUCTION_AUTHORIZED=@("IN_CONSTRUCTION","BLOCKED","ABANDONED");IN_CONSTRUCTION=@("PACKAGE_VERIFIED","BLOCKED","ABANDONED");PACKAGE_VERIFIED=@("PACKAGE_AUDITED","STALE","BLOCKED");PACKAGE_AUDITED=@("QUEUED","STALE","BLOCKED");QUEUED=@("INTEGRATED","STALE","BLOCKED");INTEGRATED=@("CLOSED","BLOCKED");STALE=@("IN_CONSTRUCTION","ABANDONED");BLOCKED=@("WAITING_DEPENDENCY","CONTRACT_FROZEN","IN_CONSTRUCTION","ABANDONED");CLOSED=@();ABANDONED=@()};break}
    default{Fail "$Label has no full-DAG transition map for $SubjectType"}
  }
  if(-not$transitions.ContainsKey($Previous)-or$Current-notin$transitions[$Previous]){Fail "$Label has illegal historical status edge $Previous -> $Current"}
}

function Assert-PostActivationSubjectIntroduction($Introduction,[string]$SubjectType,[string]$SubjectId,[string]$TrainId="",[string]$WorkUnitId="") {
  if($null-eq$Introduction-or$null-eq$Introduction.Snapshot){Fail "$SubjectType $SubjectId post-activation introduction is missing its immutable snapshot"}
  if(@($Introduction.Parents).Count-ne1){Fail "$SubjectType $SubjectId post-activation introduction must be a single-parent commit: $($Introduction.Commit)"}
  $snapshot=$Introduction.Snapshot;$expectedPrevious="NONE";$expectedCurrent=""
  switch($SubjectType){
    "RELEASE_TRAIN"{$mode=(Require-Text $snapshot.Subject "executionMode" "$SubjectType $SubjectId introduction").ToUpperInvariant();$expectedCurrent=if($mode-eq"VALIDATION_ONLY"){"PLANNED"}elseif($mode-eq"BUSINESS_CONSTRUCTION"){"DRAFT"}else{Fail "$SubjectType $SubjectId introduction has unsupported executionMode $mode"};break}
    "WORK_UNIT"{$expectedCurrent="PLANNED";break}
    "EXECUTION_SYSTEM"{$expectedPrevious="NONE/NONE";$expectedCurrent="BOOTSTRAP/NOT_ENABLED";break}
    "INTEGRATION_QUEUE"{$expectedCurrent="NOT_ENABLED";break}
    default{Fail "$SubjectType $SubjectId has no post-activation introduction policy"}
  }
  if("$($snapshot.Previous)"-ne$expectedPrevious-or"$($snapshot.Status)"-ne$expectedCurrent){Fail "$SubjectType $SubjectId post-activation introduction must declare $expectedPrevious -> $expectedCurrent"}
  Assert-TransitionAuthorityRecord "$($snapshot.AuthorityRef)" $SubjectType $SubjectId $expectedPrevious $expectedCurrent "$($snapshot.ChangedAt)" "$SubjectType $SubjectId post-activation introduction" $TrainId $WorkUnitId "$($Introduction.Commit)"
}

function Assert-StatusHistoryBinding([string]$RepoPath,[string]$SubjectType,[string]$SubjectId,[string]$Current,[string]$Previous,[string]$ChangedAt,[string]$AuthorityRef,[string]$TrainId="",[string]$WorkUnitId="",[string]$BaselineCommit="",[string[]]$SameStatusClosureFields=@(),[string[]]$CarryForwardFields=@()) {
  $normalized=Normalize-RepoPath $RepoPath "status history path"
  $controlCommit=Get-ControlCommit
  $allCommits=@(Invoke-Git $Root @("rev-list",$controlCommit,"--full-history","--",$normalized))
  $epochBoundary="";$epochBoundarySnapshot=$null
  if(-not[string]::IsNullOrWhiteSpace($BaselineCommit)){
    if($BaselineCommit-notmatch'^[0-9a-fA-F]{40}$'){Fail "$SubjectType $SubjectId activation epoch boundary must be a full commit"}
    &git -C $Root merge-base --is-ancestor $BaselineCommit $controlCommit *> $null;if($LASTEXITCODE-ne0){Fail "$SubjectType $SubjectId activation epoch boundary is not an ancestor of immutable control commit"}
    $epochBoundary=$BaselineCommit.ToLowerInvariant();$epochBoundarySnapshot=Get-HistoryStatusSnapshotAtCommit $epochBoundary $normalized $SubjectType $SubjectId $TrainId $WorkUnitId
    if($SubjectType-eq"EXECUTION_SYSTEM" -and $null-ne$epochBoundarySnapshot){if("$($epochBoundarySnapshot.Status)"-ne"BOOTSTRAP/NOT_ENABLED"-or"$($epochBoundarySnapshot.Previous)"-ne"NONE/NONE"){Fail "activation epoch boundary must be a strict BOOTSTRAP/NOT_ENABLED execution snapshot"};foreach($anchor in @("enablementApprovalRef","auditedCandidateCommit","independentAuditRef","humanConfirmationRef","authorityEnvelopeCommit","enablementApprovalDigest","independentAuditDigest","humanConfirmationDigest")){if((Get-OptionalValue $epochBoundarySnapshot.Subject $anchor)-ne"PENDING"){Fail "activation epoch boundary execution anchor $anchor must be PENDING"}};Assert-TransitionAuthorityRecord $epochBoundarySnapshot.AuthorityRef "EXECUTION_SYSTEM" $SubjectId "NONE/NONE" "BOOTSTRAP/NOT_ENABLED" $epochBoundarySnapshot.ChangedAt "activation epoch execution bootstrap authority" "" "" $epochBoundary}
    if($SubjectType-eq"INTEGRATION_QUEUE" -and $null-ne$epochBoundarySnapshot){if("$($epochBoundarySnapshot.Status)"-ne"NOT_ENABLED"-or"$($epochBoundarySnapshot.Previous)"-ne"NONE"){Fail "activation epoch boundary must be a strict NOT_ENABLED queue snapshot"};if((Get-OptionalValue $epochBoundarySnapshot.Subject "acceptingItems")-ne$false-or@(Get-Array $epochBoundarySnapshot.Subject "items").Count-ne0){Fail "activation epoch boundary queue must be closed and empty"};Assert-TransitionAuthorityRecord $epochBoundarySnapshot.AuthorityRef "INTEGRATION_QUEUE" $SubjectId "NONE" "NOT_ENABLED" $epochBoundarySnapshot.ChangedAt "activation epoch queue bootstrap authority" "" "" $epochBoundary}
    if($SubjectType-eq"RELEASE_TRAIN" -and $null-ne$epochBoundarySnapshot -and "$($epochBoundarySnapshot.Status)"-notin@("PLANNED","DRAFT")){Fail "activation epoch boundary Train must remain PLANNED or DRAFT"}
    if($SubjectType-eq"WORK_UNIT" -and $null-ne$epochBoundarySnapshot -and "$($epochBoundarySnapshot.Status)"-ne"PLANNED"){Fail "activation epoch boundary Work Unit must remain PLANNED"}
    $allPost=@(Invoke-Git $Root @("rev-list","$epochBoundary..$controlCommit")|Where-Object{$_-match'^[0-9a-f]{40}$'});$ancestryPost=@(Invoke-Git $Root @("rev-list","--ancestry-path","$epochBoundary..$controlCommit")|Where-Object{$_-match'^[0-9a-f]{40}$'});$extra=@(Compare-Object @($allPost|Sort-Object) @($ancestryPost|Sort-Object)|Where-Object SideIndicator -eq '<=');if($extra.Count){Fail "activation epoch contains reachable commits outside C..control ancestry-path; rebase old sibling before enablement"}
    Assert-StrictActivationBaseline $epochBoundary
  }
  # Once C exists, validate every real DAG edge from C to the immutable control
  # commit.  A path-limited rev-list may omit a TREESAME authority-envelope
  # commit (E), which would make the following status-switch commit (S) appear
  # parentless even though its real parent contains the subject snapshot.
  $commits=if([string]::IsNullOrWhiteSpace($epochBoundary)){@($allCommits)}else{@($epochBoundary)+@($allPost)}
  if($commits.Count-eq0){Fail "$SubjectType $SubjectId has no immutable file history"}
  $currentSnapshot=Get-HistoryStatusSnapshotAtCommit $controlCommit $normalized $SubjectType $SubjectId $TrainId $WorkUnitId
  if($null-eq$currentSnapshot){Fail "$SubjectType $SubjectId is missing from current immutable history"}
  $currentClosure=ConvertTo-CanonicalJsonText (Get-HistorySubjectClosure $currentSnapshot $SubjectType);$introductions=@();$deletions=@();$epochEntries=@()
  if(-not[string]::IsNullOrWhiteSpace($epochBoundary)-and$null-ne$epochBoundarySnapshot){
    $introductions+=[pscustomobject]@{Commit=$epochBoundary;Snapshot=$epochBoundarySnapshot;Parents=@();ParentSnapshots=@()}
  }
  foreach($commit in $commits){
    $snapshot=Get-HistoryStatusSnapshotAtCommit $commit $normalized $SubjectType $SubjectId $TrainId $WorkUnitId
    $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+';$parents=@($line|Select-Object -Skip 1);$parentSnapshots=@();foreach($parent in $parents){if(-not[string]::IsNullOrWhiteSpace($epochBoundary)-and$parent-eq$epochBoundary){$parentSnapshots+=$epochBoundarySnapshot}else{if(-not[string]::IsNullOrWhiteSpace($epochBoundary)){&git -C $Root merge-base --is-ancestor $epochBoundary $parent *> $null;if($LASTEXITCODE-ne0){continue}};$parentSnapshots+=Get-HistoryStatusSnapshotAtCommit $parent $normalized $SubjectType $SubjectId $TrainId $WorkUnitId}}
    if(-not[string]::IsNullOrWhiteSpace($epochBoundary)-and$commit-eq$epochBoundary){$parentSnapshots=@()}
    $parentPresence=@($parentSnapshots|Where-Object{$null-ne$_}).Count
    if($null-ne$snapshot-and$parentPresence-eq0){
      if(-not[string]::IsNullOrWhiteSpace($epochBoundary)){
        if($commit-eq$epochBoundary-and$null-ne$epochBoundarySnapshot){}
        elseif($null-eq$epochBoundarySnapshot){$introductions+=[pscustomobject]@{Commit="$commit";Snapshot=$snapshot;Parents=$parents;ParentSnapshots=$parentSnapshots}}
        else{Fail "$SubjectType $SubjectId was reintroduced without a post-C parent snapshot at $commit"}
      }else{$introductions+=[pscustomobject]@{Commit="$commit";Snapshot=$snapshot;Parents=$parents;ParentSnapshots=$parentSnapshots}}
    }
    elseif($null-eq$snapshot-and$parentPresence-gt0){$deletions+="$commit"}
    if($null-ne$snapshot){
      foreach($parentSnapshot in @($parentSnapshots|Where-Object{$null-ne$_})){
        if("$($snapshot.Status)"-eq"$($parentSnapshot.Status)"){
          if("$($snapshot.Previous)"-ne"$($parentSnapshot.Previous)"-or"$($snapshot.ChangedAt)"-ne"$($parentSnapshot.ChangedAt)"-or"$($snapshot.AuthorityRef)"-ne"$($parentSnapshot.AuthorityRef)"){
            Fail "$SubjectType $SubjectId transition metadata changed without a status transition at $commit"
          }
          if((ConvertTo-CanonicalJsonText (Get-HistorySubjectClosure $snapshot $SubjectType))-cne(ConvertTo-CanonicalJsonText (Get-HistorySubjectClosure $parentSnapshot $SubjectType))){
            Fail "$SubjectType $SubjectId state closure changed without a status transition at $commit"
          }
        }else{
          if($parents.Count-ne1-or$parentSnapshots.Count-ne1){Fail "$SubjectType $SubjectId historical status transition must be a single-parent commit: $commit"}
          if("$($snapshot.Previous)"-ne"$($parentSnapshot.Status)"){Fail "$SubjectType $SubjectId historical previousStatus differs from immutable parent at $commit"}
          $historyMode=""
          if($SubjectType-eq"RELEASE_TRAIN"){$parentMode=(Require-Text $parentSnapshot.Subject "executionMode" "$SubjectType $SubjectId immutable parent").ToUpperInvariant();$historyMode=(Require-Text $snapshot.Subject "executionMode" "$SubjectType $SubjectId immutable child").ToUpperInvariant();if($parentMode-ne$historyMode){Fail "$SubjectType $SubjectId changed immutable executionMode at $commit"}}
          Assert-HistoryLegalStatusEdge $SubjectType "$($parentSnapshot.Status)" "$($snapshot.Status)" "$SubjectType $SubjectId" $historyMode
          Assert-TransitionAuthorityRecord "$($snapshot.AuthorityRef)" $SubjectType $SubjectId "$($parentSnapshot.Status)" "$($snapshot.Status)" "$($snapshot.ChangedAt)" "$SubjectType $SubjectId historical transition" $TrainId $WorkUnitId $commit
          foreach($field in @(Get-HistoryCarryForwardFields $SubjectType "$($parentSnapshot.Status)" "$($snapshot.Status)")){
            if((ConvertTo-CanonicalJsonText (Get-OptionalValue $parentSnapshot.Subject $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $snapshot.Subject $field))){Fail "$SubjectType $SubjectId historical transition $($parentSnapshot.Status) -> $($snapshot.Status) replaced carry-forward closure field $field"}
          }
        }
      }
    }
    if(Test-HistoryEpoch $snapshot $Current $Previous $ChangedAt $AuthorityRef){
      if((ConvertTo-CanonicalJsonText (Get-HistorySubjectClosure $snapshot $SubjectType))-cne$currentClosure){Fail "$SubjectType $SubjectId current state closure changed at reachable commit $commit and was later restored or merge-resolved"}
      if(@($parentSnapshots|Where-Object{Test-HistoryEpoch $_ $Current $Previous $ChangedAt $AuthorityRef}).Count-eq0){$epochEntries+=[pscustomobject]@{Commit="$commit";Snapshot=$snapshot;Parents=$parents;ParentSnapshots=$parentSnapshots}}
    }
  }
  if($introductions.Count-ne1){Fail "$SubjectType $SubjectId must have exactly one reachable introduction event; found $($introductions.Count)"}
  $introduction=$introductions[0]
  if(-not[string]::IsNullOrWhiteSpace($epochBoundary)-and"$($introduction.Commit)"-ne$epochBoundary){
    Assert-PostActivationSubjectIntroduction $introduction $SubjectType $SubjectId $TrainId $WorkUnitId
  }
  if($deletions.Count){Fail "$SubjectType $SubjectId was deleted after introduction and may not be re-added"}
  if($epochEntries.Count-ne1){Fail "$SubjectType $SubjectId current transition epoch must have exactly one DAG entry; found $($epochEntries.Count)"}
  $entry=$epochEntries[0]
  if($Previous-eq"NONE"){
    if(@($entry.ParentSnapshots|Where-Object{$null-ne$_}).Count-ne0){Fail "$SubjectType $SubjectId initial transition has a prior subject"}
    if($entry.Parents.Count-gt1){Fail "$SubjectType $SubjectId initial transition may not be introduced by a merge commit"}
  }else{
    if($entry.Parents.Count-ne1-or$entry.ParentSnapshots.Count-ne1-or$null-eq$entry.ParentSnapshots[0]){Fail "$SubjectType $SubjectId status transition must be a single-parent commit with an existing prior subject"}
    if("$($entry.ParentSnapshots[0].Status)"-ne$Previous){Fail "$SubjectType $SubjectId previousStatus self-report differs from immutable parent: declared $Previous, actual $($entry.ParentSnapshots[0].Status)"}
    foreach($field in $CarryForwardFields){if((ConvertTo-CanonicalJsonText (Get-OptionalValue $entry.ParentSnapshots[0].Subject $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $currentSnapshot.Subject $field))){Fail "$SubjectType $SubjectId transition $Previous -> $Current replaced carry-forward closure field $field"}}
  }
}

function Assert-QueueItemHistoryBinding($Item,$Record,[int]$Sequence,[string]$BaselineCommit) {
  $queuePath="governance/execution/integration-queue.json";$manifestPath=$Record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
  $trainId=Require-Text $Item "trainId" "Queue history item";$workUnitId=Require-Text $Item "workUnitId" "Queue history item"
  $previous=Require-Text $Item "previousStatus" "Queue history item";$changedAt=Require-Text $Item "statusChangedAt" "Queue history item";$authorityRef=Require-Text $Item "transitionAuthorityRef" "Queue history item"
  $queueClosureFields=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","candidateRecordRef","evidenceRefs","auditRefs","evidenceBindings","auditBindings")
  $currentCanonical=ConvertTo-CanonicalJsonText $Item;$introductions=@();$deletions=@()
  $controlCommit=Get-ControlCommit
  foreach($commit in @(Invoke-Git $Root @("rev-list",$controlCommit,"--full-history","--",$queuePath))){
    $snapshot=Get-HistoryStatusSnapshotAtCommit $commit $queuePath "QUEUE_ITEM" "$trainId/$workUnitId/$Sequence" $trainId $workUnitId
    $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+';$parents=@($line|Select-Object -Skip 1);$parentSnapshots=@();foreach($parent in $parents){$parentSnapshots+=Get-HistoryStatusSnapshotAtCommit $parent $queuePath "QUEUE_ITEM" "$trainId/$workUnitId/$Sequence" $trainId $workUnitId}
    $parentPresence=@($parentSnapshots|Where-Object{$null-ne$_}).Count
    if($null-ne$snapshot){if((ConvertTo-CanonicalJsonText $snapshot.Subject)-cne$currentCanonical){Fail "Queue item $Sequence changed at reachable commit $commit and was later restored or merge-resolved"};if($parentPresence-eq0){$introductions+=[pscustomobject]@{Commit="$commit";Parents=$parents}}}
    elseif($parentPresence-gt0){$deletions+="$commit"}
  }
  if($introductions.Count-ne1){Fail "Queue item $Sequence must have exactly one reachable introduction event; found $($introductions.Count)"}
  if($deletions.Count){Fail "Queue item $Sequence was deleted and re-added while still current"}
  $introductionCommit=$introductions[0].Commit
  $introLine=(Invoke-Git $Root @("rev-list","--parents","-n","1",$introductionCommit)|Select-Object -First 1).Trim()-split'\s+'
  if($introLine.Count-ne2){Fail "Queue item $Sequence introduction must be a single-parent commit"}
  $parent=$introLine[1];&git -C $Root cat-file -e "$parent`:$manifestPath" 2>$null
  $actualPrevious=if($LASTEXITCODE-eq0){Require-Text (Read-GitJson $parent $manifestPath "Queue item parent Manifest") "status" "Queue item parent Manifest"}else{"NONE"}
  if($actualPrevious-ne$previous){Fail "Queue item $Sequence previousStatus differs from its Work Unit status in the immutable parent: declared $previous, actual $actualPrevious"}
}

function Assert-AllQueueItemHistoryBindings($IdentitySet,$CurrentQueue) {
  $queuePath="governance/execution/integration-queue.json";$controlCommit=Get-ControlCommit;$commits=@(Invoke-Git $Root @("rev-list",$controlCommit,"--full-history","--",$queuePath))
  $historicalKeys=@{};$sequenceOwners=@{};$maxHistoricalSequence=0
  foreach($commit in $commits){
    if(@(Invoke-Git $Root @("ls-tree",$commit,"--",$queuePath)).Count-eq0){continue}
    $document=Read-GitJson $commit $queuePath "Integration Queue full DAG history"
    $currentNext=[int](Require-Text $document "nextSequence" "Historical Integration Queue")
    $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+';$parents=@($line|Select-Object -Skip 1)
    foreach($parent in $parents){
      if(@(Invoke-Git $Root @("ls-tree",$parent,"--",$queuePath)).Count){$parentDocument=Read-GitJson $parent $queuePath "Integration Queue parent history";$parentNext=[int](Require-Text $parentDocument "nextSequence" "Historical Integration Queue parent");if($currentNext-lt$parentNext){Fail "Integration Queue nextSequence decreased from $parentNext to $currentNext at $commit"}}
    }
    foreach($item in @(Get-LedgerItems $document "items" "Historical Integration Queue")){
      $sequence=[int](Require-Text $item "sequence" "Historical Integration Queue item");$trainId=Require-Text $item "trainId" "Historical Integration Queue item";$workUnitId=Require-Text $item "workUnitId" "Historical Integration Queue item"
      $identity="$trainId/$workUnitId".ToLowerInvariant();$key="$identity/$sequence";$historicalKeys[$key]=[pscustomobject]@{TrainId=$trainId;WorkUnitId=$workUnitId;Sequence=$sequence;Identity=$identity}
      if($sequenceOwners.ContainsKey($sequence)-and$sequenceOwners[$sequence]-ne$identity){Fail "Integration Queue sequence $sequence was reused by $identity after $($sequenceOwners[$sequence])"};$sequenceOwners[$sequence]=$identity;if($sequence-gt$maxHistoricalSequence){$maxHistoricalSequence=$sequence}
    }
  }
  $currentNextSequence=[int](Require-Text $CurrentQueue "nextSequence" "Integration Queue")
  if($currentNextSequence-le$maxHistoricalSequence){Fail "Integration Queue nextSequence must remain greater than every historical sequence $maxHistoricalSequence"}
  foreach($history in $historicalKeys.Values){
    $subjectId="$($history.TrainId)/$($history.WorkUnitId)/$($history.Sequence)";$introductions=@();$deletions=@();$states=@()
    foreach($commit in $commits){
      $snapshot=Get-HistoryStatusSnapshotAtCommit $commit $queuePath "QUEUE_ITEM" $subjectId $history.TrainId $history.WorkUnitId
      $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+';$parents=@($line|Select-Object -Skip 1);$parentSnapshots=@();foreach($parent in $parents){$parentSnapshots+=Get-HistoryStatusSnapshotAtCommit $parent $queuePath "QUEUE_ITEM" $subjectId $history.TrainId $history.WorkUnitId}
      $parentPresence=@($parentSnapshots|Where-Object{$null-ne$_}).Count
      if($null-ne$snapshot){$states+=[pscustomobject]@{Commit=$commit;Item=$snapshot.Subject};if($parentPresence-eq0){$introductions+=[pscustomobject]@{Commit=$commit;Item=$snapshot.Subject;Parents=$parents;ParentSnapshots=$parentSnapshots}}}
      elseif($parentPresence-gt0){$deletions+=[pscustomobject]@{Commit=$commit;Parents=$parents;ParentSnapshots=$parentSnapshots}}
    }
    if($introductions.Count-ne1){Fail "Queue item $subjectId must have exactly one reachable introduction event; found $($introductions.Count)"}
    $introducedCanonical=ConvertTo-CanonicalJsonText $introductions[0].Item;foreach($state in $states){if((ConvertTo-CanonicalJsonText $state.Item)-cne$introducedCanonical){Fail "Queue item $subjectId changed at reachable commit $($state.Commit) and was later restored or merge-resolved"}}
    if($introductions[0].Parents.Count-ne1){Fail "Queue item $subjectId introduction must be a single-parent commit"}
    if(-not$IdentitySet.ContainsKey($history.Identity)){Fail "historical Queue item $subjectId references a missing permanent Work Unit record"}
    $record=$IdentitySet[$history.Identity];$manifestPath=$record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
    Assert-HistoricalQueueItemRecord $introductions[0].Item "Queue item $subjectId introduction"
    Assert-TransitionAuthorityRecord (Require-Text $introductions[0].Item "transitionAuthorityRef" "Queue item $subjectId introduction") "QUEUE_ITEM" $subjectId "PACKAGE_AUDITED" "QUEUED" (Require-Text $introductions[0].Item "statusChangedAt" "Queue item $subjectId introduction") "Queue item $subjectId introduction authority" $history.TrainId $history.WorkUnitId $introductions[0].Commit
    $introManifest=Get-HistoryStatusSnapshotAtCommit $introductions[0].Commit $manifestPath "WORK_UNIT" $history.WorkUnitId $history.TrainId $history.WorkUnitId
    $introParentManifest=Get-HistoryStatusSnapshotAtCommit $introductions[0].Parents[0] $manifestPath "WORK_UNIT" $history.WorkUnitId $history.TrainId $history.WorkUnitId
    if($null-eq$introManifest-or$null-eq$introParentManifest-or"$($introManifest.Status)"-ne"QUEUED"-or"$($introParentManifest.Status)"-ne"PACKAGE_AUDITED"){Fail "Queue item $subjectId introduction is not atomically bound to Work Unit PACKAGE_AUDITED -> QUEUED"}
    Assert-HistoricalQueuePackageClosure $introductions[0].Item $introManifest $introductions[0].Commit "Queue item $subjectId introduction"
    $currentItem=Get-HistoryStatusSnapshotAtCommit $controlCommit $queuePath "QUEUE_ITEM" $subjectId $history.TrainId $history.WorkUnitId
    if($null-ne$currentItem){if($deletions.Count){Fail "current Queue item $subjectId was deleted and re-added or merge-restored"}}
    else{
      if($deletions.Count-ne1){Fail "historical Queue item $subjectId must have exactly one reachable removal event; found $($deletions.Count)"}
      $removal=$deletions[0];if($removal.Parents.Count-ne1){Fail "Queue item $subjectId removal must be a single-parent serial Integration commit"}
      $removalItem=Get-HistoryStatusSnapshotAtCommit $removal.Parents[0] $queuePath "QUEUE_ITEM" $subjectId $history.TrainId $history.WorkUnitId
      Assert-HistoricalQueueItemRecord $removalItem.Subject "Queue item $subjectId removal parent"
      Assert-HistoricalQueuePackageClosure $removalItem.Subject $introManifest $removal.Parents[0] "Queue item $subjectId removal parent"
      $removalManifest=Get-HistoryStatusSnapshotAtCommit $removal.Commit $manifestPath "WORK_UNIT" $history.WorkUnitId $history.TrainId $history.WorkUnitId
      $removalParentManifest=Get-HistoryStatusSnapshotAtCommit $removal.Parents[0] $manifestPath "WORK_UNIT" $history.WorkUnitId $history.TrainId $history.WorkUnitId
      if($null-eq$removalManifest-or$null-eq$removalParentManifest-or"$($removalParentManifest.Status)"-ne"QUEUED"-or"$($removalManifest.Previous)"-ne"QUEUED"-or"$($removalManifest.Status)"-notin@("INTEGRATED","STALE","BLOCKED")){Fail "Queue item $subjectId removal is not atomically bound to a serial QUEUED -> INTEGRATED|STALE|BLOCKED Work Unit transition"}
      # Removal is represented by the Work Unit manifest transition at the
      # serial integration commit.  The queue item itself is immutable and
      # its introduction authority only covers PACKAGE_AUDITED -> QUEUED.
      $removalAuthority = Require-Text $removalManifest.Subject "transitionAuthorityRef" "Queue item $subjectId removal manifest"
      Assert-TransitionAuthorityRecord $removalAuthority "WORK_UNIT" $history.WorkUnitId "QUEUED" "$($removalManifest.Status)" (Require-Text $removalManifest.Subject "statusChangedAt" "Queue item $subjectId removal manifest") "Queue item $subjectId removal Work Unit authority" $history.TrainId $history.WorkUnitId $removal.Commit
    }
  }
}

function Assert-HistoricalQueueItemRecord($Item,[string]$Label){
  Assert-AllowedFields $Item @("sequence","trainId","workUnitId","status","previousStatus","statusChangedAt","candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","candidateRecordRef","evidenceRefs","auditRefs","evidenceBindings","auditBindings","transitionAuthorityRef","submittedAt") $Label
  foreach($field in @("sequence","trainId","workUnitId","status","previousStatus","statusChangedAt","candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","candidateRecordRef","transitionAuthorityRef")){Require-Text $Item $field $Label|Out-Null}
  $submittedAt=Require-Text $Item "submittedAt" $Label;$submittedParsed=[DateTimeOffset]::MinValue;if(-not[DateTimeOffset]::TryParse($submittedAt,[ref]$submittedParsed)){Fail "$Label submittedAt must be an ISO timestamp"};if($submittedAt-ne(Require-Text $Item "statusChangedAt" $Label)){Fail "$Label submittedAt must equal statusChangedAt"}
  foreach($field in @("evidenceRefs","auditRefs","evidenceBindings","auditBindings")){if(@(Require-ArrayField $Item $field $Label $true).Count-eq0){Fail "$Label requires non-empty $field closure"}}
}

function Assert-HistoricalQueuePackageClosure($Item,$ManifestSnapshot,[string]$Commit,[string]$Label){
  if($null-eq$ManifestSnapshot){Fail "$Label is missing the Work Unit Manifest snapshot"}
  foreach($field in @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","candidateRecordRef","evidenceRefs","auditRefs","evidenceBindings","auditBindings")){
    if((ConvertTo-CanonicalJsonText (Get-OptionalValue $Item $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $ManifestSnapshot.Subject $field))){Fail "$Label closure field $field differs from the introduction Manifest"}
  }
  $candidate=Require-Text $Item "candidateCommit" $Label
  if($candidate -notmatch '^[0-9a-fA-F]{40}$'){Fail "$Label candidateCommit must be a full commit hash"}
  $candidateType=(Invoke-Git $Root @("cat-file","-t",$candidate)|Select-Object -First 1).Trim();if($candidateType-ne"commit"){Fail "$Label candidateCommit is not a commit"}
  & git -C $Root merge-base --is-ancestor $candidate $Commit *> $null
  if($LASTEXITCODE -ne 0){Fail "$Label candidateCommit must be an ancestor of its introduction commit"}
  if((Require-Text $Item "candidateDigestAlgorithm" $Label)-ne"GIT_COMMIT_TREE_SHA256_V1"){Fail "$Label candidateDigestAlgorithm is unsupported"}
  if((Require-Text $Item "candidateDigest" $Label).ToLowerInvariant() -ne (Get-CandidateDigest $candidate)){Fail "$Label candidateDigest does not match the immutable candidate"}
  foreach($kind in @("evidenceRefs","auditRefs")){
    foreach($ref in @(Require-ArrayField $Item $kind "$Label $kind" $true)){
      $normalized=Normalize-RepoPath "$ref" "$Label $kind ref";if(@(Invoke-Git $Root @("ls-tree",$Commit,"--",$normalized)).Count-eq0){Fail "$Label $kind record was added after the queue introduction: $normalized"}
      $record=Read-GitJson $Commit $normalized "$Label $kind record"
      $expectedType=if($kind-eq"evidenceRefs"){"EVIDENCE"}else{"INDEPENDENT_AUDIT"};Assert-RecordValue $record "recordType" $expectedType "$Label $kind record"
      Assert-RecordValue $record "trainId" (Require-Text $Item "trainId" $Label) "$Label $kind record"
      Assert-RecordValue $record "workUnitId" (Require-Text $Item "workUnitId" $Label) "$Label $kind record"
      Assert-RecordValue $record "candidateCommit" $candidate "$Label $kind record"
      Assert-RecordValue $record "candidateDigest" (Require-Text $Item "candidateDigest" $Label) "$Label $kind record"
      Assert-RecordValue $record "baseCommit" (Require-Text $Item "baseCommit" $Label) "$Label $kind record"
      Assert-RecordValue $record "contractRevision" (Require-Text $Item "contractRevision" $Label) "$Label $kind record"
      Assert-RecordValue $record "environmentDigest" (Require-Text $Item "environmentDigest" $Label) "$Label $kind record"
      if((Require-Text $record "result" "$Label $kind record").ToUpperInvariant() -ne "PASS"){Fail "$Label $kind record must be PASS"}
      if($kind-eq"evidenceRefs"){$checks=@(Require-ArrayField $record "checks" "$Label evidence checks" $true|ForEach-Object{"$_".ToUpperInvariant()});if($checks-notcontains"CLEAN_WORKTREE_RECORDED"-or$checks-notcontains"IMMUTABLE_COMMIT_VERIFIED"){Fail "$Label evidence record lacks immutable clean-worktree checks"}}
      else{
        $independent=(Get-OptionalValue $record "independentFromWriter")-eq$true;if(-not$independent){Fail "$Label audit record must set independentFromWriter=true"}
        $checks=@(Require-ArrayField $record "checks" "$Label audit checks" $true|ForEach-Object{"$_".ToUpperInvariant()});if($checks-notcontains"PACKAGE_EVIDENCE_BINDINGS_VERIFIED"){Fail "$Label audit record lacks PACKAGE_EVIDENCE_BINDINGS_VERIFIED"}
        $auditRefs=@(Require-ArrayField $record "evidenceRefs" "$Label audit evidenceRefs" $true|ForEach-Object{"$_"}|Sort-Object);$itemEvidence=@(Require-ArrayField $Item "evidenceRefs" "$Label item evidenceRefs" $true|ForEach-Object{"$_"}|Sort-Object);if(@(Compare-Object $auditRefs $itemEvidence).Count){Fail "$Label audit evidenceRefs do not equal the Queue item evidenceRefs"}
        $auditEvidenceBindings=@(Require-ArrayField $record "evidenceBindings" "$Label audit evidenceBindings" $true);$itemEvidenceBindings=@(Require-ArrayField $Item "evidenceBindings" "$Label item evidenceBindings" $true);if($auditEvidenceBindings.Count-ne$itemEvidenceBindings.Count){Fail "$Label audit evidenceBindings must equal the Queue item evidenceBindings"}
        $itemBindingsByRef=@{};foreach($itemBinding in $itemEvidenceBindings){Assert-AllowedFields $itemBinding @("ref","sha256","blobOid") "$Label item evidence binding";$itemRef=(Require-Text $itemBinding "ref" "$Label item evidence binding").ToLowerInvariant();if($itemBindingsByRef.ContainsKey($itemRef)){Fail "$Label item evidenceBindings contains duplicate $itemRef"};$itemBindingsByRef[$itemRef]=$itemBinding}
        foreach($auditBinding in $auditEvidenceBindings){Assert-AllowedFields $auditBinding @("ref","sha256","blobOid") "$Label audit evidence binding";$auditRef=(Require-Text $auditBinding "ref" "$Label audit evidence binding").ToLowerInvariant();if(-not$itemBindingsByRef.ContainsKey($auditRef)){Fail "$Label audit evidence binding ref is not declared by item bindings: $auditRef"};$itemBinding=$itemBindingsByRef[$auditRef];if((Require-Text $auditBinding "sha256" "$Label audit evidence binding").ToLowerInvariant()-ne(Require-Text $itemBinding "sha256" "$Label item evidence binding").ToLowerInvariant()-or(Require-Text $auditBinding "blobOid" "$Label audit evidence binding").ToLowerInvariant()-ne(Require-Text $itemBinding "blobOid" "$Label item evidence binding").ToLowerInvariant()){Fail "$Label audit evidence binding content differs from Queue item binding: $auditRef"}}
      }
    }
    if($kind-eq"evidenceRefs" -and (Require-Text $Item "candidateRecordRef" $Label) -notin @(Require-ArrayField $Item "evidenceRefs" "$Label evidenceRefs" $true)){Fail "$Label candidateRecordRef must be present in intro evidenceRefs"}
    $bindingField=if($kind-eq"evidenceRefs"){"evidenceBindings"}else{"auditBindings"};$declared=@(Require-ArrayField $Item $bindingField "$Label $bindingField" $true);$seen=@{}
    foreach($binding in $declared){Assert-AllowedFields $binding @("ref","sha256","blobOid") "$Label $bindingField";$ref=Normalize-RepoPath (Require-Text $binding "ref" "$Label $bindingField") "$Label $bindingField";if($seen.ContainsKey($ref)){Fail "$Label $bindingField contains duplicate $ref"};$seen[$ref]=$true;if(@(Invoke-Git $Root @("ls-tree",$Commit,"--",$ref)).Count-eq0){Fail "$Label $binding ref was added after introduction: $ref"};$blob=Get-GitBlobAtPath $Commit $ref;if((Require-Text $binding "blobOid" "$Label $bindingField").ToLowerInvariant() -ne $blob.ToLowerInvariant()){Fail "$Label $binding blob does not match introduction commit: $ref"};$recordAtCommit=Read-GitJson $Commit $ref "$Label binding record";if((Require-Text $binding "sha256" "$Label $bindingField").ToLowerInvariant() -ne(Get-CanonicalRecordDigest $recordAtCommit)){Fail "$Label binding digest does not match introduction record: $ref"}}
  }
}

function ConvertTo-CanonicalJsonText($Value) {
  if ($null -eq $Value) { return "null" }
  if ($Value -is [string] -or $Value -is [char]) { return (ConvertTo-Json -InputObject "$Value" -Compress) }
  if ($Value -is [bool]) { if ($Value) { return "true" }; return "false" }
  if ($Value -is [System.Collections.IDictionary]) {
    $pairs = @()
    foreach ($key in @($Value.Keys | ForEach-Object { "$_" } | Sort-Object)) {
      $pairs += "$(ConvertTo-Json -InputObject $key -Compress):$(ConvertTo-CanonicalJsonText $Value[$key])"
    }
    return "{$($pairs -join ',')}"
  }
  if ($Value -is [pscustomobject]) {
    $pairs = @()
    foreach ($property in @($Value.PSObject.Properties | Sort-Object Name)) {
      $pairs += "$(ConvertTo-Json -InputObject $property.Name -Compress):$(ConvertTo-CanonicalJsonText $property.Value)"
    }
    return "{$($pairs -join ',')}"
  }
  if ($Value -is [System.Collections.IEnumerable]) {
    $items = @()
    foreach ($item in $Value) { $items += ConvertTo-CanonicalJsonText $item }
    return "[$($items -join ',')]"
  }
  return (ConvertTo-Json -InputObject $Value -Compress)
}

function Get-CanonicalRecordDigest($Record) {
  return Get-Sha256Hex ("STRICT_RECORD_CANONICAL_JSON_SHA256_V1`n" + (ConvertTo-CanonicalJsonText $Record))
}

function Get-ImmutableEnablementRegistrySnapshot($Registry) {
  return [ordered]@{
    schemaVersion=(Get-OptionalValue $Registry "schemaVersion")
    updatedAt=(Get-OptionalValue $Registry "updatedAt")
    enablementConditions=(Get-OptionalValue $Registry "enablementConditions")
    canonicalRoot=(Get-OptionalValue $Registry "canonicalRoot")
    managedWorktreePool=(Get-OptionalValue $Registry "managedWorktreePool")
    maxConcurrentWriteWorkUnits=(Get-OptionalValue $Registry "maxConcurrentWriteWorkUnits")
    trains=(Get-OptionalValue $Registry "trains")
  }
}

function Get-ImmutableEnablementQueueSnapshot($Queue) {
  return [ordered]@{
    schemaVersion=(Get-OptionalValue $Queue "schemaVersion")
    updatedAt=(Get-OptionalValue $Queue "updatedAt")
    acceptingItems=(Get-OptionalValue $Queue "acceptingItems")
    mode=(Get-OptionalValue $Queue "mode")
    ownerRole=(Get-OptionalValue $Queue "ownerRole")
    nextSequence=(Get-OptionalValue $Queue "nextSequence")
    items=(Get-OptionalValue $Queue "items")
    rules=(Get-OptionalValue $Queue "rules")
  }
}

function Assert-IndependentAuditRecord($Record, [string]$RequiredCheck, [string]$Label) {
  Assert-RecordValue $Record "actorRole" "Audit Agent" $Label
  if ((Require-Text $Record "result" $Label).ToUpperInvariant() -ne "PASS" -or
      (Get-OptionalValue $Record "independentFromWriter") -ne $true) {
    Fail "$Label must be PASS, independentFromWriter=true, and produced by Audit Agent"
  }
  $checks = @(Get-Array $Record "checks" | ForEach-Object {
    if ($_ -isnot [string] -or [string]::IsNullOrWhiteSpace("$_")) { Fail "$Label checks must contain non-blank strings" }
    "$($_)".Trim().ToUpperInvariant()
  })
  if ($checks.Count -eq 0 -or $checks -notcontains $RequiredCheck.ToUpperInvariant()) {
    Fail "$Label must include required check $RequiredCheck"
  }
}

function Get-Sha256Hex([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object { $_.ToString("x2") }) -join "") }
  finally { $sha.Dispose() }
}

function Get-CandidateDigest([string]$CandidateCommit) {
  if ($CandidateCommit -notmatch '^[0-9a-fA-F]{40}$') { Fail "candidateCommit must be a full commit hash before digest calculation" }
  $type = (Invoke-Git $Root @("cat-file", "-t", $CandidateCommit) | Select-Object -First 1).Trim()
  if ($type -ne "commit") { Fail "candidateCommit is not an immutable commit object: $CandidateCommit" }
  $tree = (Invoke-Git $Root @("rev-parse", "$CandidateCommit^{tree}") | Select-Object -First 1).Trim()
  return Get-Sha256Hex "GIT_COMMIT_TREE_SHA256_V1`ncommit=$($CandidateCommit.ToLowerInvariant())`ntree=$tree"
}

function Get-RuntimeInputPaths([string]$CandidateCommit,[string]$TrainId) {
  $registry=Read-GitJson $CandidateCommit "governance/execution/train-registry.json" "Runtime candidate Train Registry"
  $train=@($registry.trains|Where-Object{"$($_.trainId)"-eq$TrainId});if($train.Count-ne1){Fail "runtime candidate must contain exactly one validation Train $TrainId"}
  $paths=@(
    "scripts/test-managed-worktree-isolation.ps1","scripts/check-managed-worktree-boundaries.ps1",
    "governance/execution/templates/docker-compose.worktree.yml",
    "governance/execution/leases.json","governance/execution/integration-queue.json","governance/execution/migration-reservations.json"
  )
  foreach($ref in @(Get-Array $train[0] "workUnitRefs")){$normalized=Normalize-RepoPath "$ref" "Runtime validation workUnitRef";if($normalized-notmatch'^governance/execution/work-units/[^/]+\.json$'){Fail "Runtime validation workUnitRef is outside canonical work-units: $normalized"};$paths+=$normalized}
  return @($paths|Sort-Object -Unique)
}

function Get-RuntimeInputDigest([string]$CandidateCommit,[string]$TrainId) {
  $entries=@();foreach($path in @(Get-RuntimeInputPaths $CandidateCommit $TrainId)){$blob=Get-GitBlobAtPath $CandidateCommit $path;if([string]::IsNullOrWhiteSpace($blob)){Fail "runtime input is missing from candidate $CandidateCommit`: $path"};$entries+="$path=$blob"}
  return Get-Sha256Hex ("GIT_PATH_BLOB_SET_SHA256_V1`ntrainId=$TrainId`n"+($entries-join"`n"))
}

function Get-DockerBindingDigest([string]$Context,[string]$Endpoint,[string]$EngineId) {
  return Get-Sha256Hex "DOCKER_DAEMON_BINDING_SHA256_V1`ncontext=$Context`nendpoint=$Endpoint`nengineId=$EngineId"
}

function Assert-CandidateDigestBinding([string]$CandidateCommit, [string]$DeclaredDigest, [string]$Algorithm, [string]$Label) {
  $actual = Get-CandidateDigest $CandidateCommit
  if ($Algorithm -ne "GIT_COMMIT_TREE_SHA256_V1" -or $DeclaredDigest.ToLowerInvariant() -ne $actual) { Fail "$Label candidateDigest does not match the immutable candidate commit/tree" }
  return $actual
}

function Assert-CanonicalTrackedPath([string]$Ref, [string]$Label, [string[]]$AllowedPrefixes = @()) {
  $normalized = Normalize-RepoPath $Ref $Label
  if ($AllowedPrefixes.Count -gt 0 -and -not @($AllowedPrefixes | Where-Object { Test-PrefixMatch $normalized $_ }).Count) {
    Fail "$Label is outside its canonical record directory: $normalized"
  }
  $fullPath = Join-Path $Root $normalized
  if (-not (Test-ControlLeaf $fullPath)) { Fail "$Label is missing: $normalized" }
  if($script:ControlCommit-ne"HEAD"){
    &git -C $Root cat-file -e "$($script:ControlCommit)`:$normalized" 2>$null
    if($LASTEXITCODE-ne0){Fail "$Label must exist in immutable snapshot: $normalized"}
    return $normalized
  }
  & git -C $Root ls-files --error-unmatch -- $normalized *> $null
  if ($LASTEXITCODE -ne 0) { Fail "$Label must be a tracked canonical repository file: $normalized" }
  & git -C $Root cat-file -e "HEAD`:$normalized" 2>$null
  if ($LASTEXITCODE -ne 0) { Fail "$Label must exist in immutable HEAD: $normalized" }
  $status = @(& git -C $Root status --porcelain=v1 -z --untracked-files=all -- $normalized 2>&1)
  if ($LASTEXITCODE -ne 0 -or -not [string]::IsNullOrWhiteSpace(($status -join ""))) { Fail "$Label must be clean and byte-bound to immutable HEAD: $normalized" }
  return $normalized
}

function Assert-LegalStatusTransition([string]$Previous, [string]$Current, $Transitions, [string]$Label) {
  $previousStatus = $Previous.ToUpperInvariant(); $currentStatus = $Current.ToUpperInvariant()
  if (-not $Transitions.ContainsKey($previousStatus) -or $currentStatus -notin @($Transitions[$previousStatus])) {
    Fail "$Label has illegal status transition $previousStatus -> $currentStatus"
  }
}

function Assert-TransitionAuthorityRecord([string]$AuthorityRef, [string]$SubjectType, [string]$SubjectId, [string]$Previous, [string]$Current, [string]$ChangedAt, [string]$Label, [string]$TrainId = "", [string]$WorkUnitId = "", [string]$AtCommit = "") {
  $parsed = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse($ChangedAt, [ref]$parsed)) { Fail "$Label statusChangedAt is not an ISO timestamp" }
  $normalizedAuthority = Normalize-RepoPath $AuthorityRef "$Label transitionAuthorityRef"
  if (-not [string]::IsNullOrWhiteSpace($AtCommit)) {
    if ($normalizedAuthority -notmatch '^governance/execution/transitions/[^/]+\.json$') { Fail "$Label transition authority must be under canonical transitions path" }
    if (@(Invoke-Git $Root @("ls-tree", $AtCommit, "--", $normalizedAuthority)).Count -eq 0) { Fail "$Label transition authority record must exist in the transition commit: $AtCommit" }
    $atBlob=Get-GitBlobAtPath $AtCommit $normalizedAuthority;$headBlob=Get-GitBlobAtPath (Get-ControlCommit) $normalizedAuthority;if([string]::IsNullOrWhiteSpace($atBlob)-or$atBlob-ne$headBlob){Fail "$Label transition authority blob must remain identical from binding commit to immutable control commit"}
    $record = Read-GitJson $AtCommit $normalizedAuthority "$Label transition authority at transition commit"
    Assert-AllowedFields $record @("schemaVersion","recordType","recordId","createdAt","subjectType","subjectId","trainId","workUnitId","previousStatus","currentStatus","changedAt","scope","decision","actorRole","checks") "$Label transition record"
    Require-SchemaVersion $record 1 "$Label transition record";Assert-StrictRecordIdentity $record "$Label transition record"
    $entry = [pscustomobject]@{Ref=$normalizedAuthority;Record=$record;FullPath=(Join-Path $Root $normalizedAuthority)}
  } else {
    $entry = Read-StrictRecord $normalizedAuthority "$Label transitionAuthorityRef" @("governance/execution/transitions")
    $record = $entry.Record
  }
  Assert-RecordValue $record "recordType" "TRANSITION" "$Label transition record"
  Assert-RecordValue $record "subjectType" $SubjectType "$Label transition record"
  Assert-RecordValue $record "subjectId" $SubjectId "$Label transition record"
  Assert-RecordValue $record "previousStatus" $Previous "$Label transition record"
  Assert-RecordValue $record "currentStatus" $Current "$Label transition record"
  Assert-RecordValue $record "changedAt" $ChangedAt "$Label transition record"
  Assert-RecordValue $record "decision" "APPROVED" "$Label transition record"
  if (-not [string]::IsNullOrWhiteSpace($TrainId)) { Assert-RecordValue $record "trainId" $TrainId "$Label transition record" }
  if (-not [string]::IsNullOrWhiteSpace($WorkUnitId)) { Assert-RecordValue $record "workUnitId" $WorkUnitId "$Label transition record" }
  $actorRole = Require-Text $record "actorRole" "$Label transition record"
  if ($actorRole -notin @("Human Owner","General Contractor Agent","Construction Owner","Contract Owner","Integration Owner","Audit Agent")) { Fail "$Label transition record has unsupported actorRole $actorRole" }
  $checks = @(Get-Array $record "checks" | ForEach-Object { ("$_").Trim().ToUpperInvariant() })
  if ($checks.Count -eq 0 -or $checks -notcontains "LEGAL_STATUS_EDGE_VERIFIED") { Fail "$Label transition record lacks LEGAL_STATUS_EDGE_VERIFIED" }
  Assert-TransitionPolicy $record $SubjectType $Previous $Current "$Label transition record"
}

function Assert-TransitionPolicy($Record,[string]$SubjectType,[string]$Previous,[string]$Current,[string]$Label) {
  $roles=@();$scope=""
  if($Previous-match'^NONE(?:/NONE)?$' -and (
    ($SubjectType-eq"EXECUTION_SYSTEM"-and$Current-eq"BOOTSTRAP/NOT_ENABLED")-or
    ($SubjectType-eq"INTEGRATION_QUEUE"-and$Current-eq"NOT_ENABLED")-or
    ($SubjectType-eq"RELEASE_TRAIN"-and$Current-in@("PLANNED","DRAFT"))-or
    ($SubjectType-eq"WORK_UNIT"-and$Current-eq"PLANNED")
  )){$roles=@("Human Owner","General Contractor Agent");$scope="GOVERNANCE_EXECUTION_CONTROL"}
  elseif($SubjectType-in@("EXECUTION_SYSTEM","INTEGRATION_QUEUE")){$roles=@("Human Owner");$scope="GOVERNANCE_EXECUTION_ENABLEMENT"}
  elseif($SubjectType-eq"QUEUE_ITEM"-and$Previous-eq"PACKAGE_AUDITED"-and$Current-eq"QUEUED"){$roles=@("Integration Owner");$scope="INTEGRATION_QUEUE_CONTROL"}
  elseif($SubjectType-eq"QUEUE_ITEM"-and$Previous-eq"QUEUED"-and$Current-eq"INTEGRATED"){$roles=@("Integration Owner");$scope="SERIAL_INTEGRATION"}
  elseif($SubjectType-eq"QUEUE_ITEM"-and$Previous-eq"QUEUED"-and$Current-in@("STALE","BLOCKED")){$roles=@("Integration Owner");$scope="SERIAL_INTEGRATION"}
  elseif($SubjectType-eq"RELEASE_TRAIN"){
    switch($Current){
      "VALIDATION_AUTHORIZED"{$roles=@("Human Owner");$scope="RUNTIME_CANARY_VALIDATION"}
      "CHARTER_HUMAN_APPROVED"{$roles=@("Human Owner");$scope="TRAIN_BUSINESS_CONSTRUCTION"}
      "ASSEMBLING"{$roles=@("General Contractor Agent");$scope="TRAIN_EXECUTION_CONTROL"}
      "TRAIN_VERIFIED"{$roles=@("Integration Owner");$scope="TRAIN_INTEGRATION_VERIFICATION"}
      "HUMAN_ACCEPTED"{$roles=@("Human Owner");$scope="TRAIN_HUMAN_ACCEPTANCE"}
      "PHASE_LOCKS_COMPLETED"{$roles=@("Human Owner");$scope="PHASE_LOCK_CLOSURE"}
      "CLOSED"{$roles=@("General Contractor Agent");$scope="TRAIN_CLOSURE"}
      "BLOCKED"{$roles=@("Human Owner","General Contractor Agent");$scope="TRAIN_EXECUTION_CONTROL"}
      "ABANDONED"{$roles=@("Human Owner");$scope="TRAIN_CANCELLATION"}
      {$_-in@("PLANNED","DRAFT")}{$roles=@("Human Owner");$scope="TRAIN_EXECUTION_CONTROL"}
    }
  }
  elseif($SubjectType-eq"WORK_UNIT"){
    switch($Current){
      "WAITING_DEPENDENCY"{$roles=@("General Contractor Agent","Human Owner");$scope="WORK_UNIT_EXECUTION_CONTROL"}
      "CONTRACT_FROZEN"{$roles=@("Contract Owner","Human Owner");$scope="WORK_UNIT_CONTRACT_FREEZE"}
      "CONSTRUCTION_AUTHORIZED"{$roles=@("Human Owner");$scope="WORK_UNIT_CONSTRUCTION_AUTHORIZATION"}
      "IN_CONSTRUCTION"{$roles=@("Construction Owner");$scope="WORK_UNIT_CONSTRUCTION"}
      "PACKAGE_VERIFIED"{$roles=@("Construction Owner");$scope="WORK_UNIT_PACKAGE_VERIFICATION"}
      "PACKAGE_AUDITED"{$roles=@("Audit Agent");$scope="WORK_UNIT_PACKAGE_AUDIT"}
      "QUEUED"{$roles=@("Integration Owner");$scope="INTEGRATION_QUEUE_CONTROL"}
      "INTEGRATED"{$roles=@("Integration Owner");$scope="SERIAL_INTEGRATION"}
      "CLOSED"{$roles=@("General Contractor Agent");$scope="WORK_UNIT_CLOSURE"}
      "STALE"{$roles=@("Contract Owner","General Contractor Agent");$scope="WORK_UNIT_CONTRACT_STALE"}
      "BLOCKED"{$roles=@("General Contractor Agent","Human Owner");$scope="WORK_UNIT_EXECUTION_CONTROL"}
      "ABANDONED"{$roles=@("Human Owner");$scope="WORK_UNIT_CANCELLATION"}
    }
  }
  if($roles.Count-eq0-or[string]::IsNullOrWhiteSpace($scope)){Fail "$Label has no fail-closed authority policy for $SubjectType $Previous -> $Current"}
  if((Require-Text $Record "actorRole" $Label)-notin$roles){Fail "$Label actorRole is not authorized for $SubjectType $Previous -> $Current"}
  Assert-RecordValue $Record "scope" $scope $Label
}

function Assert-StatusTransition([string]$Previous, [string]$Current, $Transitions, [string]$Label, [string]$ChangedAt, [string]$AuthorityRef, [string]$SubjectType, [string]$SubjectId, [string]$TrainId = "", [string]$WorkUnitId = "") {
  Assert-LegalStatusTransition $Previous $Current $Transitions $Label
  Assert-TransitionAuthorityRecord $AuthorityRef $SubjectType $SubjectId $Previous $Current $ChangedAt $Label $TrainId $WorkUnitId
}

function Read-StrictRecord([string]$Ref, [string]$Label, [string[]]$AllowedPrefixes) {
  $normalized = Assert-CanonicalTrackedPath $Ref $Label $AllowedPrefixes
  $head=Get-ControlCommit;if($head-eq"HEAD"){$head=(Invoke-Git $Root @("rev-parse","HEAD")|Select-Object -First 1).Trim()};$cacheKey="$script:Root|$head|$normalized".ToLowerInvariant();if($script:StrictRecordCache.ContainsKey($cacheKey)){return $script:StrictRecordCache[$cacheKey]}
  if ($normalized -notmatch '\.json$') { Fail "$Label must be a strict JSON record: $normalized" }
  $record = Read-Json (Join-Path $Root $normalized) $Label
  $recordType = (Require-Text $record "recordType" $Label).ToUpperInvariant()
  $common = @("schemaVersion","recordType","recordId","createdAt")
  $typeFields = switch ($recordType) {
    "ENABLEMENT_APPROVAL" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","decision","scope","auditRef","humanConfirmationRef","actorRole") }
    "INDEPENDENT_ENABLEMENT_AUDIT" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","result","scope","independentFromWriter","checks","actorRole") }
    "HUMAN_CONFIRMATION" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","decision","scope","confirmationCode","confirmationText","actorRole") }
    "TRAIN_BUSINESS_APPROVAL" { @("trainId","baseCommit","charterRef","charterDigest","decision","scope","confirmationCode","confirmationText","actorRole") }
    "RUNTIME_VALIDATION_APPROVAL" { @("trainId","candidateCommit","candidateDigest","candidateDigestAlgorithm","runtimeInputDigest","runtimeInputDigestAlgorithm","dockerContext","dockerEndpoint","dockerEngineId","dockerBindingDigest","decision","scope","confirmationCode","confirmationText","actorRole") }
    "INDEPENDENT_RUNTIME_SAFETY_AUDIT" { @("trainId","candidateCommit","candidateDigest","candidateDigestAlgorithm","runtimeInputDigest","runtimeInputDigestAlgorithm","dockerContext","dockerEndpoint","dockerEngineId","dockerBindingDigest","result","scope","independentFromWriter","checks","actorRole") }
    "EVIDENCE" { @("trainId","workUnitId","candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","result","checks","actorRole") }
    "INDEPENDENT_AUDIT" { @("trainId","workUnitId","candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","result","independentFromWriter","evidenceRefs","evidenceBindings","checks","actorRole") }
    "TRANSITION" { @("subjectType","subjectId","trainId","workUnitId","previousStatus","currentStatus","changedAt","scope","decision","actorRole","checks") }
    "CONTRACT_FREEZE_AUTHORITY" { @("trainId","frozenContractRevision","protectedPaths","protectedPathsDigest","digestAlgorithm","decision","scope","actorRole","checks") }
    default { Fail "$Label has unsupported recordType $recordType" }
  }
  Assert-AllowedFields $record @($common+$typeFields) "$Label ($recordType)"
  Require-SchemaVersion $record 1 $Label
  Assert-StrictRecordIdentity $record $Label
  $entry=[pscustomobject]@{ Ref=$normalized; Record=$record; FullPath=(Join-Path $Root $normalized) }
  Assert-RecordImmutableSinceIntroduction $entry $Label
  $script:StrictRecordCache[$cacheKey]=$entry;return $entry
}

function Assert-RecordImmutableSinceIntroduction($Entry,[string]$Label) {
  $controlCommit=Get-ControlCommit;$commits=@(Invoke-Git $Root @("rev-list",$controlCommit,"--full-history","--",$Entry.Ref))
  if($commits.Count-eq0){Fail "$Label has no immutable Git introduction history"}
  $states=@();$additions=@();$deletions=@()
  foreach($commit in $commits){
    $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+'
    $parents=@($line|Select-Object -Skip 1);$currentTree=@(Invoke-Git $Root @("ls-tree",$commit,"--",$Entry.Ref))
    $currentBlob="";if($currentTree.Count){if($currentTree.Count-ne1-or$currentTree[0]-notmatch'^\d+\s+blob\s+([0-9a-f]{40,64})\s'){Fail "$Label has invalid Git blob history at $commit"};$currentBlob=$Matches[1]}
    $parentBlobs=@();foreach($parent in $parents){$tree=@(Invoke-Git $Root @("ls-tree",$parent,"--",$Entry.Ref));if($tree.Count){if($tree.Count-ne1-or$tree[0]-notmatch'^\d+\s+blob\s+([0-9a-f]{40,64})\s'){Fail "$Label has invalid parent blob history at $parent"};$parentBlobs+=$Matches[1]}else{$parentBlobs+=""}}
    if(-not[string]::IsNullOrWhiteSpace($currentBlob)){$states+=[pscustomobject]@{Commit="$commit";Blob=$currentBlob};if(@($parentBlobs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-eq0){$additions+=[pscustomobject]@{Commit="$commit";Blob=$currentBlob}}}
    elseif(@($parentBlobs|Where-Object{-not[string]::IsNullOrWhiteSpace($_)}).Count-gt0){$deletions+="$commit"}
  }
  if($additions.Count-ne1){Fail "$Label must have exactly one reachable Git introduction event; found $($additions.Count)"}
  if($deletions.Count){Fail "$Label was deleted after introduction; strict records may never be deleted and re-added"}
  $introducedAt=$additions[0].Commit;$introducedBlob=$additions[0].Blob
  foreach($state in $states){if($state.Blob-ne$introducedBlob){Fail "$Label blob changed after immutable introduction at $($state.Commit); create a new authority record instead"}}
  $introduced=Read-GitJson $introducedAt $Entry.Ref "$Label introduction"
  if((ConvertTo-CanonicalJsonText $introduced)-cne(ConvertTo-CanonicalJsonText $Entry.Record)){Fail "$Label differs from its immutable introduction; create a new authority record instead"}
}

function Assert-AllCanonicalStrictRecordHistory {
  $prefixes=@("governance/execution/approvals","governance/execution/evidence","governance/execution/transitions","governance/execution/contracts");$paths=@{};$recordIds=@{}
  foreach($path in @(Invoke-Git $Root @("log","--format=","--full-history","--no-renames","--name-only",(Get-ControlCommit),"--","governance/execution/approvals","governance/execution/evidence","governance/execution/transitions","governance/execution/contracts"))){if($path-match'^governance/execution/(?:approvals|evidence|transitions|contracts)/[^\s]+\.json$'){$paths[$path.ToLowerInvariant()]=$path}}
  foreach($path in $paths.Values){if(-not(Test-ControlLeaf (Join-Path $Root $path))){Fail "canonical strict record was deleted from immutable control commit after introduction: $path"};$entry=Read-StrictRecord $path "Canonical strict record history" $prefixes;$id=Require-Text $entry.Record "recordId" "Canonical strict record history";if($recordIds.ContainsKey($id)){Fail "strict recordId $id is reused across canonical paths: $($recordIds[$id]) and $path"};$recordIds[$id]=$path}
}

function Assert-StrictRecordIdentity($Record, [string]$Label) {
  $null = Require-Text $Record "recordId" $Label
  $createdAt = Require-Text $Record "createdAt" $Label
  [string[]]$formats = @(
    "yyyy-MM-dd'T'HH:mm:sszzz","yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz",
    "yyyy-MM-dd'T'HH:mm:ss'Z'","yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'"
  )
  $parsed = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParseExact($createdAt,$formats,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$parsed)) {
    Fail "$Label.createdAt must be a strict ISO-8601 timestamp with seconds and an explicit UTC offset"
  }
}

function Assert-RecordValue($Record, [string]$Property, [string]$Expected, [string]$Label) {
  $actual = Require-Text $Record $Property $Label
  if (-not $actual.Equals($Expected, [StringComparison]::OrdinalIgnoreCase)) { Fail "$Label.$Property does not bind expected value $Expected" }
}

function Assert-ExplicitHumanConfirmation($Record, [string]$RecordType, [string]$Scope, [string]$Code, [string]$ChineseTextBase64, [string]$EnglishText, [string]$Label) {
  Assert-RecordValue $Record "recordType" $RecordType $Label
  Assert-RecordValue $Record "scope" $Scope $Label
  Assert-RecordValue $Record "decision" "APPROVED" $Label
  Assert-RecordValue $Record "actorRole" "Human Owner" $Label
  Assert-RecordValue $Record "confirmationCode" $Code $Label
  $text = Require-Text $Record "confirmationText" $Label
  $ChineseText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ChineseTextBase64))
  if ($text -cne $ChineseText) { Fail "$Label confirmationText must equal the published exact Chinese approval phrase; translations, negation, or inference are forbidden" }
}

function Require-Text($Object, [string]$Property, [string]$Label) {
  $member = $Object.PSObject.Properties[$Property]
  $value = if ($null -eq $member) { $null } else { $member.Value }
  if ($null -eq $value -or [string]::IsNullOrWhiteSpace("$value")) {
    Fail "$Label is missing required field '$Property'"
  }
  return "$value".Trim()
}

function Get-Array($Object, [string]$Property) {
  if ($null -eq $Object) { return @() }
  $member = $Object.PSObject.Properties[$Property]
  if ($null -eq $member -or $null -eq $member.Value) { return @() }
  return @($member.Value)
}

function Require-ArrayField($Object, [string]$Property, [string]$Label, [bool]$RequireNonEmpty = $false) {
  $member = $Object.PSObject.Properties[$Property]
  if ($null -eq $member -or $null -eq $member.Value) { Fail "$Label is missing required array field '$Property'" }
  # Windows PowerShell unwraps a one-element JSON array into a PSCustomObject;
  # normalize that representation while still rejecting scalar/string fields.
  if($member.Value -is [System.Array]){$values=@($member.Value)}elseif($member.Value -is [pscustomobject]){$values=@($member.Value)}else{Fail "$Label is missing required array field '$Property'"}
  if ($RequireNonEmpty -and $values.Count -eq 0) { Fail "$Label required array field '$Property' may not be empty" }
  return $values
}

function Normalize-RepoPath([string]$Path, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($Path)) { Fail "$Label contains a blank path" }
  $normalized = $Path.Replace('\', '/').Trim().Trim('/')
  if ($normalized -match '^[A-Za-z]:' -or $normalized.StartsWith('/') -or
      $normalized -match '(^|/)\.\.(/|$)' -or $normalized -match '[*?\[\]]') {
    Fail "$Label must contain only normalized repository-relative file/directory prefixes: $Path"
  }
  if ($normalized -eq ".") { Fail "$Label may not lease the entire repository" }
  return $normalized
}

function Normalize-LeasePath([string]$Path, [string]$Label) {
  if ($Path -match '^[A-Za-z]:[\\/]') {
    $normalized = $Path.Replace('\', '/').TrimEnd('/')
    if ($normalized -notmatch '(?i)^G:/xlb100-worktrees/[^/]+/[^/]+$') {
      Fail "$Label absolute PATH lease must identify one managed worktree: $Path"
    }
    return $normalized
  }
  return Normalize-RepoPath $Path $Label
}

function Test-PrefixMatch([string]$Path, [string]$Prefix) {
  return $Path.Equals($Prefix, [StringComparison]::OrdinalIgnoreCase) -or
    $Path.StartsWith("$Prefix/", [StringComparison]::OrdinalIgnoreCase)
}

function Test-PrefixOverlap([string]$Left, [string]$Right) {
  return (Test-PrefixMatch $Left $Right) -or (Test-PrefixMatch $Right $Left)
}

function Get-SerialCanonicalWriterDeclaration($Manifest, [string]$Label) {
  $role = Require-Text $Manifest "role" $Label
  $writerKeyMember = $Manifest.PSObject.Properties["canonicalWriterKey"]
  $writerKey = if ($null -eq $writerKeyMember) { $null } else { $writerKeyMember.Value }
  $leaseRefs = Get-OptionalValue $Manifest "leaseRefs"
  $writerRefMember = if ($null -eq $leaseRefs) { $null } else { $leaseRefs.PSObject.Properties["canonicalWriter"] }
  $writerRef = if ($null -eq $writerRefMember) { $null } else { $writerRefMember.Value }
  $hasRole = $role -eq $SerialCanonicalWriterRole
  $hasKeyProperty = $null -ne $writerKeyMember
  $hasRefProperty = $null -ne $writerRefMember
  if (($hasRole -or $hasKeyProperty -or $hasRefProperty) -and -not ($hasRole -and $hasKeyProperty -and $hasRefProperty)) {
    Fail "$Label serial canonical writer declaration must include role, canonicalWriterKey, and leaseRefs.canonicalWriter together"
  }
  if (-not $hasRole) {
    return [pscustomobject]@{ IsSerial=$false; Key=""; LeaseId="" }
  }
  if ($writerKey -isnot [string] -or $writerRef -isnot [string]) {
    Fail "$Label serial canonical writer identifiers must be non-empty JSON strings"
  }
  if ((Require-Text $Manifest "executionMode" $Label).ToUpperInvariant() -ne "BUSINESS_CONSTRUCTION") {
    Fail "$Label serial canonical writer must use BUSINESS_CONSTRUCTION"
  }
  $normalizedKey = (Require-Text $Manifest "canonicalWriterKey" $Label).ToLowerInvariant()
  $normalizedLeaseId = (Require-Text $leaseRefs "canonicalWriter" "$Label leaseRefs").Trim()
  if ($normalizedKey -notin $AllowedSerialCanonicalWriterKeys) {
    Fail "$Label canonicalWriterKey is not enabled for managed serial delegation: $normalizedKey"
  }
  return [pscustomobject]@{ IsSerial=$true; Key=$normalizedKey; LeaseId=$normalizedLeaseId }
}

function Assert-UniqueSerialCanonicalWriterReservations($Records) {
  foreach ($key in $AllowedSerialCanonicalWriterKeys) {
    $holders = @($Records | Where-Object { $_.Active -and $_.IsSerialCanonicalWriter -and $_.CanonicalWriterKey -eq $key })
    if ($holders.Count -gt 1) {
      Fail "serial canonical writer $key is reserved by multiple non-terminal Work Units: $($holders.WorkUnitId -join ', ')"
    }
  }
}

function Get-LedgerItems($Ledger, [string]$Property, [string]$Label) {
  $member = $Ledger.PSObject.Properties[$Property]
  if ($null -eq $member -or $null -eq $member.Value) { Fail "$Label must contain a '$Property' array" }
  return @($member.Value)
}

function Get-LeaseKey($Lease, [string]$Label) {
  foreach ($property in @("key", "path", "semantic", "value", "resource")) {
    $member = $Lease.PSObject.Properties[$property]
    if ($null -ne $member -and $null -ne $member.Value -and -not [string]::IsNullOrWhiteSpace("$($member.Value)")) {
      return "$($member.Value)".Trim()
    }
  }
  Fail "$Label is missing lease key (key/path/semantic/resource)"
}

function Get-OptionalValue($Object, [string]$Property) {
  if ($null -eq $Object) { return $null }
  $member = $Object.PSObject.Properties[$Property]
  if ($null -eq $member) { return $null }
  return $member.Value
}

function Require-SchemaVersion($Object, [int]$Expected, [string]$Label) {
  $actual = Get-OptionalValue $Object "schemaVersion"
  if ($null -eq $actual -or [int]$actual -ne $Expected) { Fail "$Label schemaVersion must be $Expected; found $actual" }
}

function Require-Port($Object, [string]$Property, [string]$Label) {
  $text = Require-Text $Object $Property $Label
  $parsed = 0
  if (-not [int]::TryParse($text, [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 65535) {
    Fail "$Label.$Property must be an integer from 1 through 65535"
  }
  return $parsed
}

function Assert-StrictManifest($Manifest, [string]$Label) {
  Assert-AllowedFields $Manifest @(
    "schemaVersion","workUnitId","trainId","targetPhase","owner","role","status","previousStatus","statusChangedAt","transitionAuthorityRef",
    "executionMode","worktreePath","branch","baseCommit","baseTag","dependencies","allowedPaths","forbiddenPaths","semanticOwnership","canonicalWriterKey",
    "contractRevision","migrationReservation","leaseRefs","environment","evidencePlan","evidenceRefs","auditRefs","businessWriteAuthorized",
    "createdAt","expiresOrClosesAt","candidateCommit","candidateDigest","candidateDigestAlgorithm","environmentDigest","candidateRecordRef",
    "evidenceBindings","auditBindings"
  ) $Label
  foreach ($field in @(
    "workUnitId","trainId","targetPhase","owner","role","status","previousStatus","statusChangedAt","transitionAuthorityRef",
    "executionMode","worktreePath","branch","baseCommit","contractRevision","createdAt","expiresOrClosesAt"
  )) { $null = Require-Text $Manifest $field $Label }
  foreach ($field in @("dependencies","allowedPaths","forbiddenPaths","auditRefs")) { $null = Require-ArrayField $Manifest $field $Label }
  foreach ($field in @("semanticOwnership","evidencePlan")) { $null = Require-ArrayField $Manifest $field $Label $true }
  foreach ($field in @("migrationReservation","leaseRefs","environment","businessWriteAuthorized")) {
    if ($null -eq $Manifest.PSObject.Properties[$field]) { Fail "$Label is missing required field '$field'" }
  }
  if ((Get-OptionalValue $Manifest "businessWriteAuthorized") -isnot [bool]) { Fail "$Label businessWriteAuthorized must be a JSON boolean" }
  $environment = Get-OptionalValue $Manifest "environment"
  if ($null -ne $environment) {
    Assert-AllowedFields $environment @("slot","envFileName","composeOverrideRef","composeProject","mysqlDatabase","mysqlPort","redisNamespace","redisPort","backendPort","customerPort","workerPort","adminPort") "$Label environment"
  }
  $leaseRefs = Get-OptionalValue $Manifest "leaseRefs"
  if ($null -ne $leaseRefs) {
    Assert-AllowedFields $leaseRefs @("worktreePath","sourcePath","environment","ports","canonicalWriter") "$Label leaseRefs"
    $ports = Get-OptionalValue $leaseRefs "ports"
    if ($null -ne $ports) { Assert-AllowedFields $ports @("mysql","redis","backend","customer","worker","admin") "$Label leaseRefs.ports" }
  }
  $null = Get-SerialCanonicalWriterDeclaration $Manifest $Label
  $reservation = Get-OptionalValue $Manifest "migrationReservation"
  if ($null -ne $reservation -and "$reservation" -ne "NONE") {
    Assert-AllowedFields $reservation @("number","expectedFilename") "$Label migrationReservation"
  }
  foreach ($bindingField in @("evidenceBindings","auditBindings")) {
    $bindings = Get-OptionalValue $Manifest $bindingField
    if ($null -ne $bindings) {
      if ($bindings -isnot [System.Array]) { Fail "$Label $bindingField must be an array" }
      foreach ($binding in @($bindings)) { Assert-AllowedFields $binding @("ref","sha256","blobOid") "$Label $bindingField entry" }
    }
  }
}

function Assert-StrictTrainRegistry($Registry) {
  Assert-AllowedFields $Registry @(
    "schemaVersion","updatedAt","executionSystemStatus","enablementStatus","previousExecutionSystemStatus","previousEnablementStatus",
    "statusChangedAt","transitionAuthorityRef","enablementConditions","enablementApprovalRef","auditedCandidateCommit","independentAuditRef",
    "humanConfirmationRef","authorityEnvelopeCommit","enablementApprovalDigest","independentAuditDigest","humanConfirmationDigest",
    "canonicalRoot","managedWorktreePool","maxConcurrentWriteWorkUnits","trains"
  ) "Release Train Registry"
  foreach ($train in @(Get-LedgerItems $Registry "trains" "Release Train Registry")) {
    Assert-AllowedFields $train @(
      "trainId","title","status","previousStatus","statusChangedAt","transitionAuthorityRef","executionMode","humanApprovalStatus","approvalRef",
      "frozenContractRevision","contractAuthorityRef","contractProtectedPathsDigest",
      "runtimeCanaryAuthorized","runtimeValidationApprovalRef","runtimeValidationAuditRef","baseCommit","baseTag","baseTagObject","charterRef",
      "workUnitRefs","maxConcurrentWriteWorkUnits","businessWriteAuthorized","mainMergeAuthorized","lockAuthorized","productionAuthorized"
    ) "Release Train entry"
  }
}

function Assert-StrictLeaseLedger($Ledger) {
  Assert-AllowedFields $Ledger @("schemaVersion","leases") "Lease Ledger"
  foreach ($lease in @(Get-LedgerItems $Ledger "leases" "Lease Ledger")) {
    Assert-AllowedFields $lease @("leaseId","type","key","paths","resources","portName","port","protectedPaths","trainId","workUnitId","status") "Lease Ledger entry"
    $resources = Get-OptionalValue $lease "resources"
    if ($null -ne $resources) { Assert-AllowedFields $resources @("composeProject","mysqlDatabase","redisNamespace","mysqlVolume","redisVolume","network") "Lease resources" }
  }
}

function Assert-StrictReservationLedger($Ledger) {
  Assert-AllowedFields $Ledger @("schemaVersion","reservations") "Migration Reservation Ledger"
  foreach ($reservation in @(Get-LedgerItems $Ledger "reservations" "Migration Reservation Ledger")) {
    Assert-AllowedFields $reservation @("number","expectedFilename","trainId","workUnitId","owner","baseCommit","tables","semanticScope","status","createdAt","closedAt","reason") "Migration Reservation"
  }
}

function Assert-StrictQueue($Queue) {
  Assert-AllowedFields $Queue @(
    "schemaVersion","updatedAt","executionSystemStatus","enablementStatus","previousEnablementStatus","statusChangedAt","transitionAuthorityRef",
    "acceptingItems","mode","ownerRole","nextSequence","items","rules"
  ) "Integration Queue"
  if ((Require-Text $Queue "mode" "Integration Queue") -ne "MANUAL_AUDITABLE_SERIAL_QUEUE") { Fail "Integration Queue mode must remain MANUAL_AUDITABLE_SERIAL_QUEUE" }
  if ((Require-Text $Queue "ownerRole" "Integration Queue") -ne "Integration Owner") { Fail "Integration Queue ownerRole must remain Integration Owner" }
  if ((Get-OptionalValue $Queue "acceptingItems") -isnot [bool]) { Fail "Integration Queue acceptingItems must be a JSON boolean" }
  $rules = Get-OptionalValue $Queue "rules"
  if ($null -ne $rules) {
    Assert-AllowedFields $rules @(
      "directWorkUnitMergeToMainForbidden","requireCleanWorktree","requireManifest","requireImmutableCandidateCommit",
      "rejectUncommittedOrUntrackedCandidateContent","requireLeaseValidation","requireContractRevision","requireMigrationReservationOrNone",
      "requirePackageEvidence","requirePackageAudit","rejectStaleCandidate","rejectScopeOrLeaseViolation",
      "mainMergeRequiresSeparateHumanAuthorization","lockRequiresSeparateHumanAuthorization","queueEnablementRequiresIndependentAuditAndHumanConfirmation"
    ) "Integration Queue rules"
    foreach ($rule in @(
      "directWorkUnitMergeToMainForbidden","requireCleanWorktree","requireManifest","requireImmutableCandidateCommit",
      "rejectUncommittedOrUntrackedCandidateContent","requireLeaseValidation","requireContractRevision","requireMigrationReservationOrNone",
      "requirePackageEvidence","requirePackageAudit","rejectStaleCandidate","rejectScopeOrLeaseViolation",
      "mainMergeRequiresSeparateHumanAuthorization","lockRequiresSeparateHumanAuthorization","queueEnablementRequiresIndependentAuditAndHumanConfirmation"
    )) { if ((Get-OptionalValue $rules $rule) -ne $true) { Fail "Integration Queue rule $rule must be true" } }
  } else { Fail "Integration Queue rules are required" }
  foreach ($item in @(Get-LedgerItems $Queue "items" "Integration Queue")) {
    Assert-AllowedFields $item @(
      "sequence","trainId","workUnitId","status","previousStatus","statusChangedAt","candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit",
      "contractRevision","environmentDigest","candidateRecordRef","evidenceRefs","auditRefs","evidenceBindings","auditBindings","transitionAuthorityRef","submittedAt"
    ) "Integration Queue item"
  }
}

function Assert-EnablementAuthorityChain($Registry, [string]$ExecutionSystemStatus, [string]$EnablementStatus, $Trains) {
  $validPair = ($ExecutionSystemStatus -eq "BOOTSTRAP" -and $EnablementStatus -eq "NOT_ENABLED") -or
    ($ExecutionSystemStatus -eq "ENABLED" -and $EnablementStatus -eq "ENABLED") -or
    ($ExecutionSystemStatus -eq "DISABLED" -and $EnablementStatus -eq "DISABLED")
  if (-not $validPair) { Fail "executionSystemStatus/enablementStatus is not a valid fail-closed pair" }
  $registryTransitions = @{
    NONE=@("BOOTSTRAP"); BOOTSTRAP=@("ENABLED"); ENABLED=@("DISABLED"); DISABLED=@("ENABLED")
  }
  $enablementTransitions = @{
    NONE=@("NOT_ENABLED"); NOT_ENABLED=@("ENABLED"); ENABLED=@("DISABLED"); DISABLED=@("ENABLED")
  }
  $changedAt = Require-Text $Registry "statusChangedAt" "Release Train Registry"
  $authorityRef = Require-Text $Registry "transitionAuthorityRef" "Release Train Registry"
  $previousExecution = Require-Text $Registry "previousExecutionSystemStatus" "Release Train Registry"
  $previousEnablement = Require-Text $Registry "previousEnablementStatus" "Release Train Registry"
  Assert-LegalStatusTransition $previousExecution $ExecutionSystemStatus $registryTransitions "Release Train Registry execution system"
  Assert-LegalStatusTransition $previousEnablement $EnablementStatus $enablementTransitions "Release Train Registry enablement"
  Assert-TransitionAuthorityRecord $authorityRef "EXECUTION_SYSTEM" "GLOBAL_EXECUTION_SYSTEM" "$previousExecution/$previousEnablement" "$ExecutionSystemStatus/$EnablementStatus" $changedAt "Release Train Registry"
  $fields = @("enablementApprovalRef","auditedCandidateCommit","independentAuditRef","humanConfirmationRef","authorityEnvelopeCommit","enablementApprovalDigest","independentAuditDigest","humanConfirmationDigest")
  if ($ExecutionSystemStatus -eq "BOOTSTRAP") {
    foreach ($field in $fields) { if ((Require-Text $Registry $field "Release Train Registry") -ne "PENDING") { Fail "NOT_ENABLED registry requires $field=PENDING" } }
    return
  }
  Assert-StatusHistoryBinding "governance/execution/train-registry.json" "EXECUTION_SYSTEM" "GLOBAL_EXECUTION_SYSTEM" "$ExecutionSystemStatus/$EnablementStatus" "$previousExecution/$previousEnablement" $changedAt $authorityRef "" "" (Require-Text $Registry "auditedCandidateCommit" "Release Train Registry")
  $null=Assert-CanonicalTrackedPath "governance/execution/train-registry.json" "Enabled Train Registry"
  $null=Assert-CanonicalTrackedPath "governance/execution/integration-queue.json" "Enabled Integration Queue"
  $candidate = Require-Text $Registry "auditedCandidateCommit" "Release Train Registry"
  $candidateDigest = Get-CandidateDigest $candidate
  $controlCommit=Get-ControlCommit
  & git -C $Root merge-base --is-ancestor $candidate $controlCommit *> $null
  if ($LASTEXITCODE -ne 0) { Fail "auditedCandidateCommit must be an ancestor of the immutable control commit" }
  $candidateRegistry = Read-GitJson $candidate "governance/execution/train-registry.json" "Audited candidate Train Registry"
  $candidateQueue = Read-GitJson $candidate "governance/execution/integration-queue.json" "Audited candidate Integration Queue"
  Assert-StrictTrainRegistry $candidateRegistry
  Assert-StrictQueue $candidateQueue
  $currentQueue = Read-Json $IntegrationQueuePath "Integration Queue"
  Assert-StrictQueue $currentQueue
  $envelope = Require-Text $Registry "authorityEnvelopeCommit" "Release Train Registry"
  if ($envelope -notmatch '^[0-9a-fA-F]{40}$' -or (Invoke-Git $Root @("cat-file","-t",$envelope) | Select-Object -First 1).Trim() -ne "commit") { Fail "authorityEnvelopeCommit must be an immutable commit" }
  $envelopeLine = (Invoke-Git $Root @("rev-list","--parents","-n","1",$envelope) | Select-Object -First 1).Trim() -split '\s+'
  if ($envelopeLine.Count -ne 2 -or $envelopeLine[1] -ne $candidate.ToLowerInvariant()) { Fail "authorityEnvelopeCommit must be the single-parent direct child of auditedCandidateCommit" }
  & git -C $Root merge-base --is-ancestor $envelope $controlCommit *> $null
  if ($LASTEXITCODE -ne 0) { Fail "authorityEnvelopeCommit must be an ancestor of the immutable control commit" }
  $postEnvelopeFirstParent = @(Invoke-Git $Root @("rev-list","--first-parent","--reverse","$envelope..$controlCommit"))
  if ($postEnvelopeFirstParent.Count -eq 0) { Fail "enablement status-switch commit is missing after authorityEnvelopeCommit" }
  $enablementCommit = "$($postEnvelopeFirstParent[0])".Trim()
  $enablementLine = (Invoke-Git $Root @("rev-list","--parents","-n","1",$enablementCommit) | Select-Object -First 1).Trim() -split '\s+'
  if ($enablementLine.Count -ne 2 -or $enablementLine[1] -ne $envelope.ToLowerInvariant()) { Fail "enablement status switch must be the single-parent direct child of authorityEnvelopeCommit" }
  foreach ($path in @(Invoke-Git $Root @("diff","--no-renames","--name-only",$envelope,$enablementCommit,"--"))) {
    $normalized = Normalize-RepoPath $path "enablement status-switch diff"
    if ($normalized -notin @("governance/execution/train-registry.json","governance/execution/integration-queue.json")) { Fail "authority record changed after immutable envelope: $normalized" }
  }
  $enablementRegistry = Read-GitJson $enablementCommit "governance/execution/train-registry.json" "Enablement status-switch Train Registry"
  $enablementQueue = Read-GitJson $enablementCommit "governance/execution/integration-queue.json" "Enablement status-switch Integration Queue"
  Assert-StrictTrainRegistry $enablementRegistry; Assert-StrictQueue $enablementQueue
  if ((Require-Text $enablementRegistry "executionSystemStatus" "Enablement status-switch Train Registry") -ne "ENABLED" -or
      (Require-Text $enablementRegistry "enablementStatus" "Enablement status-switch Train Registry") -ne "ENABLED" -or
      (Require-Text $enablementQueue "executionSystemStatus" "Enablement status-switch Integration Queue") -ne "ENABLED" -or
      (Require-Text $enablementQueue "enablementStatus" "Enablement status-switch Integration Queue") -ne "ENABLED") {
    Fail "the direct post-envelope commit is not the ENABLED status switch"
  }
  $allowedEnablementRecords = @(
    Normalize-RepoPath (Require-Text $enablementRegistry "enablementApprovalRef" "Enablement status-switch Train Registry") "enablementApprovalRef"
    Normalize-RepoPath (Require-Text $enablementRegistry "independentAuditRef" "Enablement status-switch Train Registry") "independentAuditRef"
    Normalize-RepoPath (Require-Text $enablementRegistry "humanConfirmationRef" "Enablement status-switch Train Registry") "humanConfirmationRef"
    Normalize-RepoPath (Require-Text $enablementRegistry "transitionAuthorityRef" "Enablement status-switch Train Registry") "execution enablement transitionAuthorityRef"
    Normalize-RepoPath (Require-Text $enablementQueue "transitionAuthorityRef" "Enablement status-switch Integration Queue") "queue enablement transitionAuthorityRef"
  )
  if (@($allowedEnablementRecords | Sort-Object -Unique).Count -ne $allowedEnablementRecords.Count) { Fail "enablement authority closure contains duplicate record paths" }
  $envelopeDiff = @(Invoke-Git $Root @("diff","--no-renames","--name-status",$candidate,$envelope,"--"))
  if ($envelopeDiff.Count -ne $allowedEnablementRecords.Count) { Fail "authority envelope must add exactly the declared authority and transition records" }
  $envelopeAdded = @();foreach ($entry in $envelopeDiff) {if ($entry -notmatch '^A\s+(.+)$') { Fail "authority envelope may only add new immutable records: $entry" };$envelopeAdded += Normalize-RepoPath $Matches[1] "authority envelope record"}
  if (@(Compare-Object @($allowedEnablementRecords|Sort-Object) @($envelopeAdded|Sort-Object)).Count -gt 0) { Fail "authority envelope record set differs from the exact declared authority closure" }
  if ((ConvertTo-CanonicalJsonText (Get-ImmutableEnablementRegistrySnapshot $candidateRegistry)) -cne
      (ConvertTo-CanonicalJsonText (Get-ImmutableEnablementRegistrySnapshot $enablementRegistry))) {
    Fail "enablement status-switch Train Registry differs from the audited candidate outside status and authority fields"
  }
  if ((ConvertTo-CanonicalJsonText (Get-ImmutableEnablementQueueSnapshot $candidateQueue)) -cne
      (ConvertTo-CanonicalJsonText (Get-ImmutableEnablementQueueSnapshot $enablementQueue))) {
    Fail "enablement status-switch Integration Queue differs from the audited candidate outside enablement mirror fields"
  }
  $pinnedRegistryFields=@($fields+@("canonicalRoot","managedWorktreePool","maxConcurrentWriteWorkUnits","enablementConditions"))
  foreach ($field in $pinnedRegistryFields) {
    if ((ConvertTo-CanonicalJsonText (Get-OptionalValue $Registry $field)) -cne (ConvertTo-CanonicalJsonText (Get-OptionalValue $enablementRegistry $field))) {
      Fail "steady-state enabled Registry rewrote immutable enablement authority field $field"
    }
  }
  foreach($field in @("mode","ownerRole","rules")){
    if((ConvertTo-CanonicalJsonText (Get-OptionalValue $currentQueue $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $enablementQueue $field))){Fail "steady-state enabled Queue rewrote immutable enablement field $field"}
  }
  $governanceTrain = @($Trains | Where-Object { "$(Get-OptionalValue $_ 'trainId')" -eq "RT-GOV-VALIDATION-001" })
  if ($governanceTrain.Count -ne 1) { Fail "enablement authority requires the unique governance validation Train" }
  $base = Require-Text $governanceTrain[0] "baseCommit" "Governance validation Train"
  $approval = Read-StrictRecord (Require-Text $Registry "enablementApprovalRef" "Release Train Registry") "Enablement approval record" @("governance/execution/approvals")
  $audit = Read-StrictRecord (Require-Text $Registry "independentAuditRef" "Release Train Registry") "Enablement independent audit record" @("governance/execution/evidence")
  $human = Read-StrictRecord (Require-Text $Registry "humanConfirmationRef" "Release Train Registry") "Enablement Human confirmation record" @("governance/execution/approvals")
  foreach ($entry in @($approval,$audit,$human)) {
    Assert-RecordValue $entry.Record "candidateCommit" $candidate "$($entry.Record.recordType) record"
    Assert-RecordValue $entry.Record "candidateDigest" $candidateDigest "$($entry.Record.recordType) record"
    Assert-RecordValue $entry.Record "candidateDigestAlgorithm" "GIT_COMMIT_TREE_SHA256_V1" "$($entry.Record.recordType) record"
    Assert-RecordValue $entry.Record "baseCommit" $base "$($entry.Record.recordType) record"
  }
  Assert-RecordValue $approval.Record "recordType" "ENABLEMENT_APPROVAL" "Enablement approval record"
  Assert-RecordValue $approval.Record "scope" "GOVERNANCE_EXECUTION_ENABLEMENT" "Enablement approval record"
  Assert-RecordValue $approval.Record "decision" "APPROVED" "Enablement approval record"
  Assert-RecordValue $audit.Record "recordType" "INDEPENDENT_ENABLEMENT_AUDIT" "Enablement audit record"
  Assert-RecordValue $audit.Record "scope" "GOVERNANCE_EXECUTION_ENABLEMENT" "Enablement audit record"
  Assert-IndependentAuditRecord $audit.Record "CANDIDATE_CONTENT_PREFLIGHT_PASS" "Enablement audit record"
  Assert-ExplicitHumanConfirmation $human.Record "HUMAN_CONFIRMATION" "GOVERNANCE_EXECUTION_ENABLEMENT" "ENABLE_GOVERNANCE_EXECUTION" "5ZCM5oSP5ZCv55So5rK755CG5omn6KGM57O757uf" "APPROVED: ENABLE GOVERNANCE EXECUTION SYSTEM" "Enablement Human confirmation"
  Assert-RecordValue $approval.Record "auditRef" $audit.Ref "Enablement approval record"
  Assert-RecordValue $approval.Record "humanConfirmationRef" $human.Ref "Enablement approval record"
  $recordBindings = @(
    [pscustomobject]@{ Entry=$approval; DigestField="enablementApprovalDigest" }
    [pscustomobject]@{ Entry=$audit; DigestField="independentAuditDigest" }
    [pscustomobject]@{ Entry=$human; DigestField="humanConfirmationDigest" }
  )
  foreach ($binding in $recordBindings) {
    $envelopeRecord = Read-GitJson $envelope $binding.Entry.Ref "Authority envelope record"
    if ((ConvertTo-CanonicalJsonText $envelopeRecord) -cne (ConvertTo-CanonicalJsonText $binding.Entry.Record)) { Fail "authority record content differs from authorityEnvelopeCommit: $($binding.Entry.Ref)" }
    $actualRecordDigest = Get-CanonicalRecordDigest $envelopeRecord
    if ((Require-Text $Registry $binding.DigestField "Release Train Registry").ToLowerInvariant() -ne $actualRecordDigest) { Fail "authority record canonical digest mismatch: $($binding.Entry.Ref)" }
  }
  foreach ($transitionRef in @($allowedEnablementRecords | Where-Object { Test-PrefixMatch $_ "governance/execution/transitions" })) {
    $envelopeTransition = Read-GitJson $envelope $transitionRef "Authority envelope transition record"
    $currentTransition = Read-Json (Join-Path $Root $transitionRef) "Current enablement transition record"
    if ((ConvertTo-CanonicalJsonText $envelopeTransition) -cne (ConvertTo-CanonicalJsonText $currentTransition)) { Fail "enablement transition record differs from immutable authority envelope: $transitionRef" }
  }
}

function Assert-TrainAuthority($Train, $Registry, [string]$ExecutionSystemStatus, [string]$EnablementStatus) {
  $trainId = Require-Text $Train "trainId" "Release Train"
  $status = (Require-Text $Train "status" "Release Train $trainId").ToUpperInvariant()
  $mode = (Require-Text $Train "executionMode" "Release Train $trainId").ToUpperInvariant()
  $transitions = if($mode-eq"VALIDATION_ONLY"){
    @{NONE=@("PLANNED");PLANNED=@("VALIDATION_AUTHORIZED");VALIDATION_AUTHORIZED=@("TRAIN_VERIFIED");TRAIN_VERIFIED=@()}
  }elseif($mode-eq"BUSINESS_CONSTRUCTION"){
    @{NONE=@("DRAFT");DRAFT=@("CHARTER_HUMAN_APPROVED","BLOCKED","ABANDONED");CHARTER_HUMAN_APPROVED=@("ASSEMBLING","BLOCKED","ABANDONED");ASSEMBLING=@("TRAIN_VERIFIED","BLOCKED");TRAIN_VERIFIED=@("HUMAN_ACCEPTED","BLOCKED");HUMAN_ACCEPTED=@("PHASE_LOCKS_COMPLETED");PHASE_LOCKS_COMPLETED=@("CLOSED");BLOCKED=@("DRAFT","ABANDONED");CLOSED=@();ABANDONED=@()}
  }else{Fail "Release Train $trainId has unsupported executionMode $mode"}
  Assert-StatusTransition (Require-Text $Train "previousStatus" "Release Train $trainId") $status $transitions "Release Train $trainId" (Require-Text $Train "statusChangedAt" "Release Train $trainId") (Require-Text $Train "transitionAuthorityRef" "Release Train $trainId") "RELEASE_TRAIN" $trainId $trainId
  if(($ExecutionSystemStatus-eq"ENABLED"-and$EnablementStatus-eq"ENABLED")-or($ExecutionSystemStatus-eq"DISABLED"-and$EnablementStatus-eq"DISABLED")){
    $trainAuthorityClosureFields=@("approvalRef","humanApprovalStatus","runtimeValidationApprovalRef","runtimeValidationAuditRef")
    $trainCarryFields=if(($mode-eq"VALIDATION_ONLY"-and$status-eq"TRAIN_VERIFIED")-or($mode-eq"BUSINESS_CONSTRUCTION"-and$status-in@("ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED"))){$trainAuthorityClosureFields}else{@()}
    Assert-StatusHistoryBinding "governance/execution/train-registry.json" "RELEASE_TRAIN" $trainId $status (Require-Text $Train "previousStatus" "Release Train $trainId") (Require-Text $Train "statusChangedAt" "Release Train $trainId") (Require-Text $Train "transitionAuthorityRef" "Release Train $trainId") $trainId "" (Require-Text $Registry "auditedCandidateCommit" "Release Train Registry") $trainAuthorityClosureFields $trainCarryFields
  }
  $businessAuthorized = (Get-OptionalValue $Train "businessWriteAuthorized") -eq $true
  $approvalRef = Require-Text $Train "approvalRef" "Release Train $trainId"
  $approvedLifecycleStatuses = @("CHARTER_HUMAN_APPROVED","ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")
  if ($businessAuthorized -and $status -notin @("CHARTER_HUMAN_APPROVED","ASSEMBLING")) { Fail "businessWriteAuthorized is allowed only while an approved Train is assembling" }
  if ($mode -eq "BUSINESS_CONSTRUCTION" -and ($status -in $approvedLifecycleStatuses -or $businessAuthorized -or $approvalRef -ne "PENDING")) {
    if ($approvalRef -eq "PENDING") { Fail "approved or post-approval business Train cannot lose its approvalRef" }
    if ((Require-Text $Train "humanApprovalStatus" "Release Train $trainId").ToUpperInvariant() -notin @("APPROVED","HUMAN_APPROVED","EXPLICIT_HUMAN_APPROVAL_RECORDED")) { Fail "approved business Train humanApprovalStatus does not match its immutable approval record" }
    $approval = Read-StrictRecord $approvalRef "Train business approval record" @("governance/execution/approvals")
    $record = $approval.Record
    Assert-RecordValue $record "recordType" "TRAIN_BUSINESS_APPROVAL" "Train business approval record"
    Assert-RecordValue $record "trainId" $trainId "Train business approval record"
    Assert-RecordValue $record "baseCommit" (Require-Text $Train "baseCommit" "Release Train $trainId") "Train business approval record"
    $charterRef = Assert-CanonicalTrackedPath (Require-Text $Train "charterRef" "Release Train $trainId") "Train charterRef"
    Assert-RecordValue $record "charterRef" $charterRef "Train business approval record"
    Assert-RecordValue $record "charterDigest" (Get-ControlFileSha256 (Join-Path $Root $charterRef) "Train charterRef") "Train business approval record"
    Assert-ExplicitHumanConfirmation $record "TRAIN_BUSINESS_APPROVAL" "TRAIN_BUSINESS_CONSTRUCTION" "AUTHORIZE_TRAIN_BUSINESS_CONSTRUCTION" "5ZCM5oSP5omn6KGM6K+lIFJlbGVhc2UgVHJhaW4g5Lia5Yqh5pa95bel" "APPROVED: AUTHORIZE RELEASE TRAIN BUSINESS CONSTRUCTION" "Train business approval record"
  } elseif ($approvalRef -ne "PENDING") {
    Fail "non-authorized Train must keep approvalRef=PENDING"
  }
  if ($mode-eq"VALIDATION_ONLY" -and $status -in @("VALIDATION_AUTHORIZED","TRAIN_VERIFIED")) {
    $canaryFlag=(Get-OptionalValue $Train "runtimeCanaryAuthorized") -eq $true
    if ($mode -ne "VALIDATION_ONLY" -or $ExecutionSystemStatus -ne "ENABLED" -or $EnablementStatus -ne "ENABLED" -or $businessAuthorized) { Fail "$status requires enabled validation-only authority with business writes false" }
    if ($status -eq "VALIDATION_AUTHORIZED" -and -not $canaryFlag) { Fail "VALIDATION_AUTHORIZED requires runtimeCanaryAuthorized=true" }
    if ($status -ne "VALIDATION_AUTHORIZED" -and $canaryFlag) { Fail "$status must retain runtime authority but set runtimeCanaryAuthorized=false" }
    $approval = Read-StrictRecord (Require-Text $Train "runtimeValidationApprovalRef" "Release Train $trainId") "Runtime validation approval record" @("governance/execution/approvals")
    $audit = Read-StrictRecord (Require-Text $Train "runtimeValidationAuditRef" "Release Train $trainId") "Runtime validation audit record" @("governance/execution/evidence")
    $controlCommit=Get-ControlCommit;$candidate=Require-Text $approval.Record "candidateCommit" "Runtime validation approval record";$digest=Get-CandidateDigest $candidate;&git -C $Root merge-base --is-ancestor $candidate $controlCommit *> $null;if($LASTEXITCODE-ne0){Fail "Runtime validation candidateCommit must be an ancestor of immutable control commit"}
    $runtimeInputDigest=Get-RuntimeInputDigest $candidate $trainId;$currentRuntimeInputDigest=Get-RuntimeInputDigest $controlCommit $trainId
    if($currentRuntimeInputDigest-ne$runtimeInputDigest){Fail "Runtime validation input closure changed after approval; authority is STALE"}
    $dockerContext=Require-Text $approval.Record "dockerContext" "Runtime validation approval record";$dockerEndpoint=Require-Text $approval.Record "dockerEndpoint" "Runtime validation approval record";$dockerEngineId=Require-Text $approval.Record "dockerEngineId" "Runtime validation approval record"
    if($dockerContext-notmatch'^[A-Za-z0-9._-]+$'){Fail "Runtime validation dockerContext is not canonical"}
    if($dockerEndpoint-notmatch'^npipe://'){Fail "Runtime validation dockerEndpoint must be an explicitly approved local Windows npipe endpoint"}
    if($dockerEngineId-notmatch'^[A-Za-z0-9._:-]+$'){Fail "Runtime validation dockerEngineId is not canonical"}
    $dockerBindingDigest=Get-DockerBindingDigest $dockerContext $dockerEndpoint $dockerEngineId
    foreach ($entry in @($approval,$audit)) {
      Assert-RecordValue $entry.Record "trainId" $trainId "Runtime validation record";Assert-RecordValue $entry.Record "candidateCommit" $candidate "Runtime validation record";Assert-RecordValue $entry.Record "candidateDigest" $digest "Runtime validation record";Assert-RecordValue $entry.Record "candidateDigestAlgorithm" "GIT_COMMIT_TREE_SHA256_V1" "Runtime validation record"
      Assert-RecordValue $entry.Record "runtimeInputDigest" $runtimeInputDigest "Runtime validation record";Assert-RecordValue $entry.Record "runtimeInputDigestAlgorithm" "GIT_PATH_BLOB_SET_SHA256_V1" "Runtime validation record"
      Assert-RecordValue $entry.Record "dockerContext" $dockerContext "Runtime validation record";Assert-RecordValue $entry.Record "dockerEndpoint" $dockerEndpoint "Runtime validation record";Assert-RecordValue $entry.Record "dockerEngineId" $dockerEngineId "Runtime validation record";Assert-RecordValue $entry.Record "dockerBindingDigest" $dockerBindingDigest "Runtime validation record"
    }
    Assert-ExplicitHumanConfirmation $approval.Record "RUNTIME_VALIDATION_APPROVAL" "RUNTIME_CANARY_VALIDATION" "AUTHORIZE_RUNTIME_CANARY_VALIDATION" "5ZCM5oSP5omn6KGMIFJ1bnRpbWUgQ2FuYXJ5IOmqjOivgQ==" "APPROVED: AUTHORIZE RUNTIME CANARY VALIDATION" "Runtime validation approval"
    Assert-RecordValue $audit.Record "recordType" "INDEPENDENT_RUNTIME_SAFETY_AUDIT" "Runtime validation audit"
    Assert-RecordValue $audit.Record "scope" "RUNTIME_CANARY_VALIDATION" "Runtime validation audit"
    Assert-IndependentAuditRecord $audit.Record "RUNTIME_CANARY_SAFETY_REVIEW_PASS" "Runtime validation audit"
  } elseif ((Get-OptionalValue $Train "runtimeCanaryAuthorized") -eq $true -or (Require-Text $Train "runtimeValidationApprovalRef" "Release Train $trainId") -ne "PENDING" -or (Require-Text $Train "runtimeValidationAuditRef" "Release Train $trainId") -ne "PENDING") {
    Fail "Runtime Canary authority fields must remain false/PENDING before VALIDATION_AUTHORIZED"
  }
  Assert-ReservedTrainAuthorityFlags $Train
}

function Assert-ReservedTrainAuthorityFlags($Train) {
  $trainId = Require-Text $Train "trainId" "Release Train reserved authority flags"
  foreach ($flag in @("mainMergeAuthorized","lockAuthorized","productionAuthorized")) {
    if ((Get-OptionalValue $Train $flag) -ne $false) { Fail "Release Train $trainId $flag must remain false; its separate Human authority workflow is not enabled" }
  }
}

function Assert-TrainWorkUnitAuthority($Record, $Train, [string]$ExecutionSystemStatus, [string]$EnablementStatus) {
  if ($Record.ExecutionMode -ne "BUSINESS_CONSTRUCTION") { return }
  $governedStatuses = @("CONTRACT_FROZEN","CONSTRUCTION_AUTHORIZED","IN_CONSTRUCTION","PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED","STALE")
  if ($Record.Status -notin $governedStatuses) { return }
  $trainId = Require-Text $Train "trainId" "Work Unit Train authority"
  $trainStatus = (Require-Text $Train "status" "Release Train $trainId").ToUpperInvariant()
  $approvedStatuses = @("CHARTER_HUMAN_APPROVED","ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")
  if ($ExecutionSystemStatus -ne "ENABLED" -or $EnablementStatus -ne "ENABLED") { Fail "business Work Unit $($Record.WorkUnitId) cannot enter $($Record.Status) while execution is NOT_ENABLED" }
  if ($trainStatus -notin $approvedStatuses -or (Require-Text $Train "approvalRef" "Release Train $trainId") -eq "PENDING") { Fail "business Work Unit $($Record.WorkUnitId) lacks approved Train authority" }
  if ($Record.Status -in @("CONSTRUCTION_AUTHORIZED","IN_CONSTRUCTION") -and ((Get-OptionalValue $Train "businessWriteAuthorized") -ne $true -or -not $Record.BusinessWriteAuthorized)) {
    Fail "business Work Unit $($Record.WorkUnitId) construction state lacks Train and Manifest businessWriteAuthorized=true"
  }
}

function Assert-TrainWorkUnitClosureConsistency($Trains,$Records,$ActiveLeases,$QueueItems,$Reservations=@()) {
  foreach($train in @($Trains)){
    $trainId=Require-Text $train "trainId" "Train closure consistency";$status=(Require-Text $train "status" "Train closure consistency").ToUpperInvariant();$mode=(Require-Text $train "executionMode" "Train closure consistency").ToUpperInvariant()
    $units=@($Records|Where-Object TrainId -eq $trainId)
    if($mode-eq"BUSINESS_CONSTRUCTION"-and$status-in@("TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")){
      $notIntegrated=@($units|Where-Object{$_.Status-notin@("INTEGRATED","CLOSED","ABANDONED")})
      if($notIntegrated.Count){Fail "Release Train $trainId cannot be $status while Work Units remain before INTEGRATED: $($notIntegrated.WorkUnitId-join', ')"}
    }
    if($mode-eq"VALIDATION_ONLY"-and$status-in@("TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")){
      $notTerminal=@($units|Where-Object{$_.Status-notin@("CLOSED","ABANDONED")})
      if($notTerminal.Count){Fail "validation Train $trainId cannot be $status while Work Units are non-terminal"}
    }
    if($status-in@("CLOSED","ABANDONED")){
      $notTerminal=@($units|Where-Object{$_.Status-notin@("CLOSED","ABANDONED")});if($notTerminal.Count){Fail "terminal Train $trainId contains non-terminal Work Units"}
      if(@($ActiveLeases|Where-Object{"$($_.trainId)"-eq$trainId}).Count){Fail "terminal Train $trainId still owns active leases"}
      if(@($QueueItems|Where-Object{"$($_.trainId)"-eq$trainId}).Count){Fail "terminal Train $trainId still has Integration Queue items"}
      if(@($Reservations|Where-Object{"$($_.trainId)"-eq$trainId-and"$($_.status)".ToUpperInvariant()-in@("RESERVED","MATERIALIZED")}).Count){Fail "terminal Train $trainId still owns an active migration reservation"}
    }
  }
  foreach($record in @($Records|Where-Object{$_.Status-in@("CLOSED","ABANDONED")})){
    if(@($ActiveLeases|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still owns active leases"}
    if(@($QueueItems|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still has an Integration Queue item"}
    if(@($Reservations|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId-and"$($_.status)".ToUpperInvariant()-in@("RESERVED","MATERIALIZED")}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still owns an active migration reservation"}
  }
}

function Assert-PackageMigrationReservationStatus([string]$WorkUnitStatus,[string]$ReservationStatus,[string]$Path,[bool]$HadIntegratedHistory=$false) {
  $workUnitState=$WorkUnitStatus.ToUpperInvariant();$reservationState=$ReservationStatus.ToUpperInvariant()
  $allowed=if($workUnitState-in@("INTEGRATED","CLOSED")-or$HadIntegratedHistory){@("MERGED")}elseif($workUnitState-in@("STALE","BLOCKED","ABANDONED")){@("RESERVED","MATERIALIZED","ABANDONED")}else{@("RESERVED","MATERIALIZED")}
  if($reservationState-notin$allowed){Fail "$workUnitState Work Unit migration $Path requires reservation status $($allowed-join'|'), not $reservationState"}
}

function Assert-NoSerialPathOverlap($ActiveWrites, [string[]]$CanonicalProtectedPaths) {
  foreach ($record in @($ActiveWrites)) {
    foreach ($allowed in @($record.AllowedPaths)) {
      foreach ($protected in $CanonicalProtectedPaths) {
        if (Test-PrefixOverlap $allowed $protected) { Fail "parallel SOURCE_PATH overlaps CANONICAL_WRITER protected path: $allowed <> $protected" }
      }
    }
  }
}

function Assert-SerialCanonicalWriterBinding($Record, $ActiveLeases) {
  if (-not $Record.IsSerialCanonicalWriter) { return }
  if ($Record.ExecutionMode -ne "BUSINESS_CONSTRUCTION") { Fail "serial canonical writer Work Unit must use BUSINESS_CONSTRUCTION" }
  if ((Require-Text $Record.Manifest "owner" "serial canonical writer Manifest") -cne "INTEGRATION-OWNER") {
    Fail "serial integration canonical writer Work Unit owner must be INTEGRATION-OWNER"
  }
  if ((Require-Text $Record.Manifest "role" "serial canonical writer Manifest") -cne $SerialCanonicalWriterRole) {
    Fail "serial canonical writer Work Unit role must be $SerialCanonicalWriterRole"
  }
  $writer = @($ActiveLeases | Where-Object { $_.Id -eq $Record.CanonicalWriterLeaseId })
  if ($writer.Count -ne 1) { Fail "serial canonical writer leaseRef does not identify one active Lease: $($Record.CanonicalWriterLeaseId)" }
  $writer = $writer[0]
  if ($writer.Type -ne "CANONICAL_WRITER" -or $writer.Key -ne $Record.CanonicalWriterKey) {
    Fail "serial canonical writer leaseRef type/key differs from Manifest declaration"
  }
  if ($writer.TrainId -ne "SYSTEM-SERIAL-LANES" -or $writer.WorkUnitId -ne "INTEGRATION-OWNER") {
    Fail "serial integration canonical writer must bind the immutable SYSTEM-SERIAL-LANES/INTEGRATION-OWNER Lease"
  }
  if ($Record.AllowedPaths.Count -eq 0) { Fail "serial canonical writer Work Unit must declare allowedPaths" }
  for ($i=0; $i -lt $Record.AllowedPaths.Count; $i++) {
    $allowed = $Record.AllowedPaths[$i]
    if (Test-PrefixMatch $allowed "governance/execution") { Fail "serial canonical writer Work Unit may not self-modify governance/execution control records" }
    $owners = @($ActiveLeases | Where-Object {
      $_.Type -eq "CANONICAL_WRITER" -and @($_.ProtectedPaths | Where-Object { Test-PrefixMatch $allowed $_ }).Count -gt 0
    })
    if ($owners.Count -ne 1 -or $owners[0].Key -ne $Record.CanonicalWriterKey) {
      Fail "serial canonical writer allowedPath is not exclusively contained by its bound writer: $allowed"
    }
    for ($j=$i+1; $j -lt $Record.AllowedPaths.Count; $j++) {
      if (Test-PrefixOverlap $allowed $Record.AllowedPaths[$j]) { Fail "serial canonical writer allowedPaths overlap: $allowed <> $($Record.AllowedPaths[$j])" }
    }
  }
  $coversAll = $true
  foreach ($protected in $writer.ProtectedPaths) {
    if (-not @($Record.AllowedPaths | Where-Object { Test-PrefixMatch $protected $_ }).Count) { $coversAll=$false;break }
  }
  if ($coversAll) { Fail "serial canonical writer Work Unit may not reserve the writer's complete protected surface" }
}

function Assert-CanonicalWriterProtection($ActiveWrites, $ActiveLeases, [bool]$RequireMandatoryCoverage = $true) {
  $requiredWriters = @($CanonicalWriterMinimumMap.Keys)
  foreach ($requiredWriter in $requiredWriters) {
    $writer = @($ActiveLeases | Where-Object { $_.Type -eq "CANONICAL_WRITER" -and $_.Key -eq $requiredWriter })
    if ($writer.Count -ne 1) { Fail "missing unique CANONICAL_WRITER lease for protected serial authority: $requiredWriter" }
    $actualPaths = @($writer[0].ProtectedPaths | ForEach-Object { Normalize-RepoPath "$_" "CANONICAL_WRITER $requiredWriter protected path" } | Sort-Object -Unique)
    foreach ($requiredPath in @($CanonicalWriterMinimumMap[$requiredWriter])) {
      if ($actualPaths -notcontains $requiredPath) { Fail "CANONICAL_WRITER $requiredWriter does not own its exact mandatory path: $requiredPath" }
    }
  }
  $canonicalWriters = @($ActiveLeases | Where-Object { $_.Type -eq "CANONICAL_WRITER" })
  for ($i=0; $i -lt $canonicalWriters.Count; $i++) {
    for ($j=$i+1; $j -lt $canonicalWriters.Count; $j++) {
      foreach ($left in $canonicalWriters[$i].ProtectedPaths) { foreach ($right in $canonicalWriters[$j].ProtectedPaths) {
        if (Test-PrefixOverlap $left $right) { Fail "CANONICAL_WRITER protected path ownership overlaps: $left <> $right" }
      }}
    }
  }
  $canonicalProtectedPaths = @($canonicalWriters | ForEach-Object { $_.ProtectedPaths } | Sort-Object -Unique)
  if ($RequireMandatoryCoverage) {
    $mandatoryPaths = @(
    "AGENTS.md","docs/CURRENT_STATE.md","docs/governance/phase-registry.json","governance/execution/train-registry.json",
    "governance/execution/leases.json","governance/execution/work-units","governance/execution/trains","governance/execution/transitions",
    "governance/execution/contracts","governance/execution/evidence","governance/execution/approvals","governance/execution/integration-queue.json",
    "governance/execution/migration-reservations.json","db/migrations","db/dictionary","packages/types","packages/validators","packages/api-client","docs/contracts",
    "backend/src/app.ts","backend/src/server.ts","backend/src/order","backend/src/pricing","backend/src/payment","backend/src/events",
    "backend/src/dispatch","backend/src/fulfillment","backend/src/ledger","backend/src/settlement","package.json","pnpm-lock.yaml","scripts"
  )
    $mandatoryPaths += @(Get-ControlFileRefs "packages" | Where-Object { $_ -match '^packages/[^/]+/src/index\.ts$' })
    foreach ($rootConfig in @("pnpm-workspace.yaml","eslint.config.mjs","tsconfig.base.json","turbo.json","vitest.config.ts","vitest.phase22.workspace.ts","vitest.workspace.ts")) { if (Test-ControlLeaf (Join-Path $Root $rootConfig)) { $mandatoryPaths += $rootConfig } }
    foreach ($requiredPath in @($mandatoryPaths | Sort-Object -Unique)) {
      if (-not @($canonicalProtectedPaths | Where-Object { Test-PrefixMatch $requiredPath $_ }).Count) { Fail "canonical writer policy does not protect mandatory serial path: $requiredPath" }
    }
  }
  Assert-NoSerialPathOverlap $ActiveWrites $canonicalProtectedPaths
}

function Get-ContractProtectedPaths($ActiveLeases) {
  $writers = @($ActiveLeases | Where-Object { $_.Type -eq "CANONICAL_WRITER" -and $_.Key -eq "shared-contract-types-validators-api-events" })
  if ($writers.Count -ne 1) { Fail "contract freshness requires the unique shared-contract CANONICAL_WRITER" }
  return @($CanonicalWriterMinimumMap["shared-contract-types-validators-api-events"] | Sort-Object -Unique)
}

function Get-ProtectedPathsDigest([string]$Revision, [string[]]$ProtectedPaths) {
  if ($Revision -notmatch '^[0-9a-fA-F]{40}$' -or (Invoke-Git $Root @("cat-file","-t",$Revision) | Select-Object -First 1).Trim() -ne "commit") {
    Fail "contract protected-path digest requires an immutable commit revision"
  }
  $entries = @()
  foreach ($path in @($ProtectedPaths | Sort-Object -Unique)) {
    $normalized = Normalize-RepoPath $path "contract protected path digest"
    $spec = "$Revision`:$normalized"
    $type = (Invoke-Git $Root @("cat-file","-t",$spec) | Select-Object -First 1).Trim()
    if ($type -notin @("tree","blob")) { Fail "contract protected path is missing or unsupported at $Revision`: $normalized" }
    $objectId = (Invoke-Git $Root @("rev-parse",$spec) | Select-Object -First 1).Trim()
    $entries += "$normalized|$type|$objectId"
  }
  return Get-Sha256Hex ("CONTRACT_PROTECTED_PATH_OBJECTS_SHA256_V1`n" + ($entries -join "`n"))
}

function Assert-ContractDigestCurrent([string]$Revision, [string]$ExpectedDigest, [string[]]$ProtectedPaths, [string]$Label) {
  $controlCommit=Get-ControlCommit
  & git -C $Root merge-base --is-ancestor $Revision $controlCommit *> $null
  if ($LASTEXITCODE -ne 0) { Fail "$Label frozenContractRevision is not in current integration history" }
  $currentRevision = (Invoke-Git $Root @("rev-parse","$controlCommit^{commit}") | Select-Object -First 1).Trim()
  $currentDigest = Get-ProtectedPathsDigest $currentRevision $ProtectedPaths
  if ($currentDigest -ne $ExpectedDigest) { Fail "$Label is STALE because protected contract paths changed after frozenContractRevision" }
}

function Assert-TrainContractAuthority($Train, $ActiveLeases) {
  $trainId = Require-Text $Train "trainId" "Release Train contract authority"
  $revision = Require-Text $Train "frozenContractRevision" "Release Train $trainId contract authority"
  $authorityRef = Require-Text $Train "contractAuthorityRef" "Release Train $trainId contract authority"
  $declaredDigest = Require-Text $Train "contractProtectedPathsDigest" "Release Train $trainId contract authority"
  $pendingCount = @(@($revision,$authorityRef,$declaredDigest) | Where-Object { "$_" -eq "PENDING" }).Count
  if ($pendingCount -gt 0) {
    if ($pendingCount -ne 3) { Fail "Release Train $trainId contract authority fields must be all PENDING or all immutable" }
    return $null
  }
  $paths = @(Get-ContractProtectedPaths $ActiveLeases)
  $entry = Read-StrictRecord $authorityRef "Release Train $trainId contract freeze authority" @("governance/execution/contracts")
  $record = $entry.Record
  Assert-RecordValue $record "recordType" "CONTRACT_FREEZE_AUTHORITY" "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "trainId" $trainId "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "frozenContractRevision" $revision "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "digestAlgorithm" "CONTRACT_PROTECTED_PATH_OBJECTS_SHA256_V1" "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "protectedPathsDigest" $declaredDigest "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "scope" "TRAIN_CONTRACT_FREEZE" "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "decision" "APPROVED" "Release Train $trainId contract freeze authority"
  Assert-RecordValue $record "actorRole" "Contract Owner" "Release Train $trainId contract freeze authority"
  $recordPaths = @(Require-ArrayField $record "protectedPaths" "Release Train $trainId contract freeze authority" $true | ForEach-Object { Normalize-RepoPath "$_" "contract freeze record path" } | Sort-Object -Unique)
  if (@(Compare-Object $paths $recordPaths).Count -gt 0) { Fail "Release Train $trainId contract freeze paths differ from the canonical contract writer lease" }
  $checks = @(Require-ArrayField $record "checks" "Release Train $trainId contract freeze authority" $true | ForEach-Object { ("$_").Trim().ToUpperInvariant() })
  if ($checks -notcontains "PROTECTED_CONTRACT_PATHS_FROZEN") { Fail "Release Train $trainId contract freeze authority lacks PROTECTED_CONTRACT_PATHS_FROZEN" }
  $actualDigest = Get-ProtectedPathsDigest $revision $paths
  if ($actualDigest -ne $declaredDigest.ToLowerInvariant()) { Fail "Release Train $trainId frozen contract digest does not match the protected paths at frozenContractRevision" }
  $controlCommit=Get-ControlCommit
  &git -C $Root merge-base --is-ancestor $revision $controlCommit *> $null
  $isCurrent=$false
  if($LASTEXITCODE-eq0){$headRevision=(Invoke-Git $Root @("rev-parse","$controlCommit^{commit}")|Select-Object -First 1).Trim();$isCurrent=(Get-ProtectedPathsDigest $headRevision $paths)-eq$actualDigest}
  return [pscustomobject]@{ Revision=$revision.ToLowerInvariant(); Digest=$actualDigest; Paths=$paths; AuthorityRef=$entry.Ref; IsCurrent=$isCurrent }
}

function Assert-WorkUnitContractAuthority($Record, $Authority, [string]$CandidateCommit = "") {
  if ($null -eq $Authority) { Fail "business Work Unit $($Record.WorkUnitId) lacks Train frozen contract authority" }
  $revision = Require-Text $Record.Manifest "contractRevision" "Work Unit $($Record.WorkUnitId) contract authority"
  $recordStatus=if($null-eq$Record.PSObject.Properties["Status"]){""}else{"$($Record.Status)".ToUpperInvariant()}
  if($recordStatus-in@("STALE","CLOSED","BLOCKED","ABANDONED")){
    if($revision-notmatch'^[0-9a-fA-F]{40}$'-or(Invoke-Git $Root @("cat-file","-t",$revision)|Select-Object -First 1).Trim()-ne"commit"){Fail "$recordStatus Work Unit must retain its prior immutable contractRevision"}
    if($revision.ToLowerInvariant()-ne$Authority.Revision){Fail "$recordStatus Work Unit contractRevision must retain its frozen Train authority revision"}
    if((Get-OptionalValue $Record "BusinessWriteAuthorized")-eq$true){Fail "$recordStatus Work Unit must be inert with businessWriteAuthorized=false"}
    return
  }
  if ($revision -notmatch '^[0-9a-fA-F]{40}$' -or $revision.ToLowerInvariant() -ne $Authority.Revision) { Fail "Work Unit $($Record.WorkUnitId) contractRevision differs from Train frozenContractRevision" }
  if($null-ne$Authority.PSObject.Properties["IsCurrent"]-and$Authority.IsCurrent-ne$true){Fail "Work Unit $($Record.WorkUnitId) contract authority is STALE and must transition to STALE before further execution"}
  if ([string]::IsNullOrWhiteSpace($CandidateCommit)) { return }
  if ($CandidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or (Invoke-Git $Root @("cat-file","-t",$CandidateCommit) | Select-Object -First 1).Trim() -ne "commit") { Fail "business candidateCommit must be an immutable commit" }
  & git -C $Root merge-base --is-ancestor $revision $CandidateCommit *> $null
  if ($LASTEXITCODE -ne 0) { Fail "candidateCommit is stale against frozenContractRevision" }
  if ((Get-ProtectedPathsDigest $CandidateCommit $Authority.Paths) -ne $Authority.Digest) { Fail "business candidate changed protected contract paths after frozenContractRevision and is STALE" }
}

function Assert-NoLockedMigrationStatusEntries([string[]]$Entries) {
  foreach ($entry in $Entries) {
    $trimmed = "$entry" -replace '[\x00\r\n]+$',''
    if ($trimmed -match '^(\?\?|[ MADRCUT?!]{2}) (.+)$') {
      $path = $Matches[2].Replace('\','/')
      if ($path -match '^db/migrations/(\d{3})[_-]' -and [int]$Matches[1] -le 57) { Fail "git status contains locked migration 000-057 content: $path" }
    }
  }
}

function Get-UniqueMigrationIndex([string[]]$FileNames) {
  $groups = @{}
  foreach ($name in $FileNames) {
    if ($name -notmatch '^(\d{3})[_-].*\.sql$') { Fail "migration SQL has noncanonical filename and no reservable number: $name" }
    $number = $Matches[1]
    if (-not $groups.ContainsKey($number)) { $groups[$number] = @() }
    $groups[$number] += $name
  }
  $index = @{}
  foreach ($number in $groups.Keys) {
    if ($groups[$number].Count -ne 1) { Fail "duplicate migration number $number in filesystem: $($groups[$number] -join ', ')" }
    $index[$number] = $groups[$number][0]
  }
  return $index
}

function Get-ReservationHistorySnapshot([string]$Commit,[string]$Number,[string]$LedgerPath) {
  $tree=@(Invoke-Git $Root @("ls-tree",$Commit,"--",$LedgerPath));if($tree.Count-eq0){return $null}
  $ledger=Read-GitJson $Commit $LedgerPath "Migration reservation DAG history"
  $matches=@(Get-LedgerItems $ledger "reservations" "Migration reservation DAG history"|Where-Object{"$($_.number)"-eq$Number})
  if($matches.Count-gt1){Fail "migration reservation $Number is duplicated in immutable commit $Commit"}
  if($matches.Count-eq0){return $null};return $matches[0]
}

function Get-GitBlobAtPath([string]$Commit,[string]$Path) {
  $tree=@(Invoke-Git $Root @("ls-tree",$Commit,"--",$Path));if($tree.Count-eq0){return ""}
  if($tree.Count-ne1-or$tree[0]-notmatch'^\d+\s+blob\s+([0-9a-f]{40,64})\s'){Fail "invalid Git blob history for $Path at $Commit"}
  return $Matches[1]
}

function Get-MigrationRawHistory([string]$RevisionSpec) {
  $events=@();$commit="";$parentCount=0
  foreach($line in @(Invoke-Git $Root @(
    "log","--format=@@COMMIT@@ %H %P","--raw","-m","--root","--full-history",
    "--no-renames","--abbrev=40","--diff-filter=ADM",$RevisionSpec,"--","db/migrations"
  ))){
    if($line-match'^@@COMMIT@@\s+([0-9a-f]{40})(?:\s+(.*))?$'){
      $commit=$Matches[1];$parents="$($Matches[2])".Trim()
      $parentCount=if([string]::IsNullOrWhiteSpace($parents)){0}else{@($parents-split'\s+'|Where-Object{$_-match'^[0-9a-f]{40}$'}).Count}
      continue
    }
    if($line-match'^:\d{6}\s+\d{6}\s+([0-9a-f]{40})\s+([0-9a-f]{40})\s+([ADM])\t(.+)$'){
      if([string]::IsNullOrWhiteSpace($commit)){Fail "migration raw history entry is missing its commit header"}
      $events+=[pscustomobject]@{Commit=$commit;ParentCount=$parentCount;OldBlob=$Matches[1];NewBlob=$Matches[2];Status=$Matches[3];Path=$Matches[4]}
    }elseif($line.StartsWith(":")){Fail "unrecognized migration raw history entry: $line"}
  }
  return @($events)
}

function Assert-LockedMigrationDag([string]$BaseCommit) {
  $controlCommit=Get-ControlCommit;&git -C $Root merge-base --is-ancestor $BaseCommit $controlCommit *> $null;if($LASTEXITCODE-ne0){Fail "Phase29 locked migration base is not an ancestor of immutable control commit"}
  $basePaths=@{};$baseBlobs=@{}
  foreach($path in @(Invoke-Git $Root @("ls-tree","-r","--name-only",$BaseCommit,"--","db/migrations"))){
    if($path-match'^db/migrations/(\d{3})[_-][^/]+\.sql$'-and[int]$Matches[1]-le57){$number=$Matches[1];if($basePaths.ContainsKey($number)){Fail "Phase29 base has duplicate locked migration number $number"};$basePaths[$number]=$path;$baseBlobs[$number]=Get-GitBlobAtPath $BaseCommit $path}
  }
  foreach($event in @(Get-MigrationRawHistory "$BaseCommit..$controlCommit")){
    if($event.Path-notmatch'^db/migrations/(?:.*/)?(\d{3})[_-][^/]+$'-or[int]$Matches[1]-gt57){continue}
    $number=$Matches[1]
    if(-not$basePaths.ContainsKey($number)-or$basePaths[$number]-ne$event.Path){Fail "locked migration number $number gained alternate historical path after Phase29 Lock: $($event.Path) at $($event.Commit)"}
    $expectedBlob=$baseBlobs[$number]
    foreach($blob in @($event.OldBlob,$event.NewBlob)|Where-Object{$_-notmatch'^0+$'}){if($blob-ne$expectedBlob){Fail "locked migration $($event.Path) changed at reachable commit $($event.Commit)"}}
    if($event.Status-eq"D"-or$event.NewBlob-match'^0+$'){Fail "locked migration $($event.Path) was deleted at reachable commit $($event.Commit)"}
  }
}

function Assert-ReservationLedgerHistory($CurrentReservations) {
  $ledgerPath = "governance/execution/migration-reservations.json"
  $controlCommit=Get-ControlCommit
  $historyCommits = @(Invoke-Git $Root @("rev-list",$controlCommit,"--full-history","--",$ledgerPath) | Where-Object { $_ -match '^[0-9a-f]{40}$' })
  $sqlIntroductions=@();$sqlDeletions=@();$sqlBlobHistory=@{}
  $migrationEvents=@(Get-MigrationRawHistory $controlCommit)
  foreach($event in $migrationEvents){
    if($event.Path-notmatch'(?i)^db/migrations/.+\.sql$'){continue}
    if($event.Path-cmatch'^db/migrations/(\d{3})[_-][^/]+\.sql$'){$sqlNumber=$Matches[1]}else{Fail "noncanonical migration SQL path exists in reachable history at $($event.Commit)`: $($event.Path)"}
    $pathKey=$event.Path.ToLowerInvariant();if(-not$sqlBlobHistory.ContainsKey($pathKey)){$sqlBlobHistory[$pathKey]=@{}}
    foreach($blob in @($event.OldBlob,$event.NewBlob)|Where-Object{$_-notmatch'^0+$'}){$sqlBlobHistory[$pathKey][$blob]=$true}
  }
  foreach($group in @($migrationEvents|Where-Object{$_.Path-match'(?i)^db/migrations/.+\.sql$'}|Group-Object{"$($_.Commit):$($_.Path.ToLowerInvariant())"})){
    $sample=$group.Group[0];$currentBlobs=@($group.Group.NewBlob|Sort-Object -Unique)
    if($currentBlobs.Count-ne1){Fail "migration history has inconsistent merge result blobs for $($sample.Path) at $($sample.Commit)"}
    $currentBlob=$currentBlobs[0];$addCount=@($group.Group|Where-Object Status -eq "A").Count
    $isIntroduction=($currentBlob-notmatch'^0+$')-and(($sample.ParentCount-eq0-and$addCount-gt0)-or($sample.ParentCount-gt0-and$addCount-eq$sample.ParentCount))
    if($isIntroduction){if($sample.Path-cmatch'^db/migrations/(\d{3})[_-][^/]+\.sql$'){$sqlIntroductions+=[pscustomobject]@{Commit=$sample.Commit;Path=$sample.Path;Number=$Matches[1]}}else{Fail "noncanonical migration SQL path exists in reachable history at $($sample.Commit)`: $($sample.Path)"}}
    if(@($group.Group|Where-Object Status -eq "D").Count){if($sample.Path-cmatch'^db/migrations/(\d{3})[_-][^/]+\.sql$'){$sqlDeletions+=[pscustomobject]@{Commit=$sample.Commit;Path=$sample.Path;Number=$Matches[1]}}else{Fail "noncanonical migration SQL path exists in reachable history at $($sample.Commit)`: $($sample.Path)"}}
  }
  $currentByNumber = @{}
  foreach ($reservation in @($CurrentReservations)) { $currentByNumber["$($reservation.number)"] = $reservation }
  foreach($sql in $sqlIntroductions){
    if($sql.Number-eq"024"){Fail "permanent migration gap 024 has reachable SQL introduction history: $($sql.Path)"}
    if([int]$sql.Number-gt57){
      if(-not$currentByNumber.ContainsKey($sql.Number)){Fail "migration SQL history $($sql.Path) at $($sql.Commit) has no permanent reservation ledger record"}
      $expected="db/migrations/$(Require-Text $currentByNumber[$sql.Number] 'expectedFilename' "Migration reservation $($sql.Number)")"
      if($sql.Path-ne$expected){Fail "migration number $($sql.Number) has historical SQL path $($sql.Path) outside its immutable expectedFilename $expected"}
    }
  }
  foreach($deletion in $sqlDeletions){Fail "migration SQL $($deletion.Path) was deleted at reachable commit $($deletion.Commit); materialized migration history is append-only"}
  foreach($group in @($sqlIntroductions|Group-Object Path)){
    if($group.Count-ne1){Fail "migration SQL $($group.Name) must have exactly one reachable introduction event; found $($group.Count)"}
  }
  foreach($group in @($sqlIntroductions|Group-Object Number)){
    $paths=@($group.Group.Path|Sort-Object -Unique);if($group.Count-ne1-or$paths.Count-ne1){Fail "migration number $($group.Name) has duplicate or sibling SQL introductions: $($group.Group.Path-join', ')"}
  }
  $statusTransitions = @{ RESERVED=@("RESERVED","MATERIALIZED","ABANDONED");MATERIALIZED=@("MATERIALIZED","MERGED","ABANDONED");MERGED=@("MERGED");ABANDONED=@("ABANDONED") }
  foreach($current in @($CurrentReservations)){
    $number=Require-Text $current "number" "Current Migration Reservation";$introductions=@();$deletions=@()
    if((Require-Text $current "owner" "Current Migration Reservation") -ne "Migration Owner"){Fail "migration reservation $number owner must be Migration Owner"}
    foreach($commit in $historyCommits){
      $line=(Invoke-Git $Root @("rev-list","--parents","-n","1",$commit)|Select-Object -First 1).Trim()-split'\s+';$parents=@($line|Select-Object -Skip 1)
      $atCommit=Get-ReservationHistorySnapshot $commit $number $ledgerPath;$parentSnapshots=@();foreach($parent in $parents){$parentSnapshots+=Get-ReservationHistorySnapshot $parent $number $ledgerPath}
      $parentPresence=@($parentSnapshots|Where-Object{$null-ne$_}).Count
      if($null-ne$atCommit){$newEdgeStatus=(Require-Text $atCommit "status" "Migration reservation $number DAG edge").ToUpperInvariant();foreach($parentSnapshot in @($parentSnapshots|Where-Object{$null-ne$_})){$oldEdgeStatus=(Require-Text $parentSnapshot "status" "Migration reservation $number DAG parent").ToUpperInvariant();if(-not$statusTransitions.ContainsKey($oldEdgeStatus)-or$newEdgeStatus-notin$statusTransitions[$oldEdgeStatus]){Fail "migration reservation $number has illegal DAG status edge $oldEdgeStatus -> $newEdgeStatus at $commit"}}}
      if($null-ne$atCommit-and$parentPresence-eq0){$introductions+=[pscustomobject]@{Commit="$commit";Record=$atCommit}}
      elseif($null-eq$atCommit-and$parentPresence-gt0){$deletions+="$commit"}
    }
    if($introductions.Count-ne1){Fail "migration reservation $number must have exactly one reachable introduction event; found $($introductions.Count)"}
    if($deletions.Count){Fail "migration reservation $number was deleted after introduction; ledger history is permanent"}
    $introduction=$introductions[0];$initialStatus=(Require-Text $introduction.Record "status" "Migration reservation $number introduction").ToUpperInvariant()
    $isBootstrap024=$number-eq"024"-and$initialStatus-eq"ABANDONED"-and(Require-Text $introduction.Record "expectedFilename" "Migration reservation 024 introduction")-eq"NONE_PERMANENT_GAP_024"
    if(-not$isBootstrap024-and$initialStatus-ne"RESERVED"){Fail "migration reservation $number introduction status must be RESERVED, not $initialStatus"}
    $numberSqlIntroductions=@($sqlIntroductions|Where-Object Number -eq $number)
    if(-not$isBootstrap024){
      $null=Require-Text $introduction.Record "expectedFilename" "Migration reservation $number introduction"
      foreach($sql in $numberSqlIntroductions){
        if($sql.Commit-eq$introduction.Commit){Fail "migration reservation $number and $($sql.Path) were introduced in the same commit; RESERVATION must be a strict ancestor"}
        &git -C $Root merge-base --is-ancestor $introduction.Commit $sql.Commit *> $null
        if($LASTEXITCODE-ne0){Fail "migration reservation $number introduction is not a strict ancestor of SQL introduction $($sql.Path) at $($sql.Commit)"}
      }
    }
    if([int]$number -gt 57 -and (Require-Text $current "status" "Current Migration Reservation").ToUpperInvariant() -eq "MERGED"){
      $expectedPath="db/migrations/$(Require-Text $current 'expectedFilename' "Migration reservation $number")";$headBlob=Get-GitBlobAtPath $controlCommit $expectedPath;if([string]::IsNullOrWhiteSpace($headBlob)){Fail "MERGED migration $number is missing its canonical SQL path $expectedPath"}
      $pathKey=$expectedPath.ToLowerInvariant();if(-not$sqlBlobHistory.ContainsKey($pathKey)){Fail "MERGED migration $number has no reachable SQL blob history for $expectedPath"}
      foreach($blob in $sqlBlobHistory[$pathKey].Keys){if($blob-ne$headBlob){Fail "MERGED migration $number SQL blob changed in reachable history: $expectedPath"}}
    }
  }
  foreach ($commit in $historyCommits) {
    if(@(Invoke-Git $Root @("ls-tree",$commit,"--",$ledgerPath)).Count-eq0){continue}
    $historicalLedger = Read-GitJson $commit $ledgerPath "Historical Migration Reservation Ledger"
    foreach ($historical in @(Get-LedgerItems $historicalLedger "reservations" "Historical Migration Reservation Ledger")) {
      $number = Require-Text $historical "number" "Historical Migration Reservation"
      if (-not $currentByNumber.ContainsKey($number)) { Fail "migration reservation history was deleted: $number" }
      $current = $currentByNumber[$number]
      foreach ($field in @("number","expectedFilename","trainId","workUnitId","owner","semanticScope")) {
        if ((Require-Text $historical $field "Historical reservation $number") -ne (Require-Text $current $field "Current reservation $number")) { Fail "migration reservation $number rewrote immutable field $field" }
      }
      $oldBase=Require-Text $historical "baseCommit" "Historical reservation $number";$newBase=Require-Text $current "baseCommit" "Current reservation $number"
      if ($oldBase -ne $newBase -and -not ($number -eq "024" -and $oldBase -eq "HISTORICAL_PERMANENT_GAP" -and $newBase -match '^[0-9a-f]{40}$')) { Fail "migration reservation $number rewrote immutable field baseCommit" }
      if ((ConvertTo-CanonicalJsonText (Get-OptionalValue $historical "tables")) -cne (ConvertTo-CanonicalJsonText (Get-OptionalValue $current "tables"))) { Fail "migration reservation $number rewrote immutable tables" }
      $oldStatus = (Require-Text $historical "status" "Historical reservation $number").ToUpperInvariant();$newStatus=(Require-Text $current "status" "Current reservation $number").ToUpperInvariant()
      if([int](Get-OptionalValue $historicalLedger "schemaVersion")-ge2){
        if((Require-Text $historical "createdAt" "Historical reservation $number")-ne(Require-Text $current "createdAt" "Current reservation $number")){Fail "migration reservation $number rewrote immutable createdAt"}
        if($oldStatus-in@("MERGED","ABANDONED")){
          if((Require-Text $historical "closedAt" "Historical reservation $number")-ne(Require-Text $current "closedAt" "Current reservation $number")-or(Require-Text $historical "reason" "Historical reservation $number")-ne(Require-Text $current "reason" "Current reservation $number")){Fail "terminal migration reservation $number rewrote closure evidence"}
        }
      }
    }
  }
}

function Get-MigrationRepositoryIndex([string]$RepositoryRoot) {
  $migrationRoot = Join-Path $RepositoryRoot "db/migrations"
  $migrationFiles = @()
  $relativeFiles=if($script:ControlCommit-ne"HEAD"-and[IO.Path]::GetFullPath($RepositoryRoot)-eq[IO.Path]::GetFullPath($Root)){
    @(Get-ControlFileRefs "db/migrations"|ForEach-Object{$_.Substring("db/migrations/".Length)})
  }else{@(Get-ChildItem -LiteralPath $migrationRoot -Recurse -Force -File|ForEach-Object{$_.FullName.Substring($migrationRoot.Length).TrimStart('\','/').Replace('\','/')})}
  foreach ($relative in $relativeFiles) {
    if ($relative.Contains('/') -or $relative -cnotmatch '^\d{3}[_-][^/]+\.sql$') {
      Fail "db/migrations may contain only top-level NNN_*.sql files: $relative"
    }
    $migrationFiles += $relative
  }
  $index = Get-UniqueMigrationIndex $migrationFiles
  if($script:ControlCommit-eq"HEAD"){
    $statusOutput = @(& git -C $RepositoryRoot status --porcelain=v1 -z --untracked-files=all --no-renames -- db/migrations 2>&1)
    if ($LASTEXITCODE -ne 0) { Fail "git status --porcelain -z failed while checking locked migrations: $($statusOutput -join ' ')" }
    $statusEntries = @((($statusOutput -join "`n") -split "`0") | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") })
    Assert-NoLockedMigrationStatusEntries $statusEntries
  }
  return $index
}

function Get-EnvironmentDigest($Record, $LeaseById) {
  $manifest = $Record.Manifest
  $leaseRefs = Get-OptionalValue $manifest "leaseRefs"
  $environmentLeaseId = (Require-Text $leaseRefs "environment" "Manifest leaseRefs").ToLowerInvariant()
  if (-not $LeaseById.ContainsKey($environmentLeaseId)) { Fail "environment digest cannot resolve ENVIRONMENT lease $environmentLeaseId" }
  $portRefs = Get-OptionalValue $leaseRefs "ports"
  $ports = [ordered]@{}
  foreach ($name in @("mysql","redis","backend","customer","worker","admin")) {
    $id = (Require-Text $portRefs $name "Manifest leaseRefs.ports").ToLowerInvariant()
    if (-not $LeaseById.ContainsKey($id)) { Fail "environment digest cannot resolve PORT lease $id" }
    $lease = $LeaseById[$id]
    $ports[$name] = [ordered]@{ leaseId=$lease.Id; portName="$($lease.PortName)"; port=[int]$lease.Port }
  }
  $environment = [ordered]@{}
  foreach ($field in @("slot","envFileName","composeOverrideRef","composeProject","mysqlDatabase","mysqlPort","redisNamespace","redisPort","backendPort","customerPort","workerPort","adminPort")) {
    $environment[$field] = Get-OptionalValue $Record.Environment $field
  }
  $environmentLease = $LeaseById[$environmentLeaseId]
  $composeRef=Assert-CanonicalTrackedPath (Require-Text $Record.Environment "composeOverrideRef" "Work Unit environment digest") "Work Unit Compose template"
  $payload = [ordered]@{
    algorithm="WORK_UNIT_ENVIRONMENT_SHA256_V1"; trainId=$Record.TrainId; workUnitId=$Record.WorkUnitId
    baseCommit=(Require-Text $manifest "baseCommit" "Work Unit environment digest"); environment=$environment
    environmentLease=[ordered]@{ leaseId=$environmentLease.Id; resources=$environmentLease.Resources }
    ports=$ports
    composeTemplateSha256=Get-ControlFileSha256 (Join-Path $Root $composeRef) "Work Unit Compose template"
  }
  return Get-Sha256Hex ($payload | ConvertTo-Json -Depth 20 -Compress)
}

function Assert-LiveCandidateWorktree($Record, [string]$CandidateCommit) {
  $worktree = Require-Text $Record.Manifest "worktreePath" "Work Unit candidate worktree"
  if (-not (Test-Path -LiteralPath $worktree -PathType Container)) { Fail "package-state Work Unit requires its registered worktree for live immutable/clean verification" }
  $head = (Invoke-Git $worktree @("rev-parse","HEAD^{commit}") | Select-Object -First 1).Trim()
  $status = @(& git -C $worktree status --porcelain=v1 -z --untracked-files=all 2>&1)
  if ($LASTEXITCODE -ne 0 -or $head -ne $CandidateCommit -or -not [string]::IsNullOrWhiteSpace(($status -join ""))) { Fail "package-state Work Unit is not clean at its immutable candidateCommit" }
}

function Get-HeadBlobOid([string]$Ref, [string]$Label) {
  $normalized = Assert-CanonicalTrackedPath $Ref $Label
  $oid = (Invoke-Git $Root @("rev-parse","$(Get-ControlCommit)`:$normalized") | Select-Object -First 1).Trim()
  if ($oid -notmatch '^[0-9a-f]{40}$') { Fail "$Label does not resolve to an immutable control blob" }
  return $oid
}

function Assert-RecordBindingSet($DeclaredBindings, $RecordEntries, [string]$Label) {
  if ($null -eq $DeclaredBindings) { Fail "$Label requires an immutable record binding array" }
  # ConvertFrom-Json unwraps a one-element JSON array to a PSCustomObject in
  # Windows PowerShell; normalize that representation without weakening the
  # exact-count/duplicate checks below.
  $entries = @($RecordEntries)
  $bindings = @($DeclaredBindings)
  if ($bindings.Count -ne $entries.Count) { Fail "$Label bindings must cover every record exactly once" }
  $expected = @{}
  foreach ($entry in $entries) {
    $key = $entry.Ref.ToLowerInvariant()
    $expected[$key] = [pscustomobject]@{
      Sha256=(Get-CanonicalRecordDigest $entry.Record)
      BlobOid=(Get-HeadBlobOid $entry.Ref "$Label record").ToLowerInvariant()
    }
  }
  $seen = @{}
  foreach ($binding in $bindings) {
    Assert-AllowedFields $binding @("ref","sha256","blobOid") "$Label binding"
    $ref = (Assert-CanonicalTrackedPath (Require-Text $binding "ref" "$Label binding") "$Label binding").ToLowerInvariant()
    if ($seen.ContainsKey($ref) -or -not $expected.ContainsKey($ref)) { Fail "$Label binding is duplicate or undeclared: $ref" }
    if ((Require-Text $binding "sha256" "$Label binding").ToLowerInvariant() -ne $expected[$ref].Sha256) { Fail "$Label canonical record digest mismatch: $ref" }
    if ((Require-Text $binding "blobOid" "$Label binding").ToLowerInvariant() -ne $expected[$ref].BlobOid) { Fail "$Label HEAD blob identity mismatch: $ref" }
    $seen[$ref] = $true
  }
}

function Assert-PackageRecordBindings($Record, [string]$CandidateCommit, [string]$CandidateDigest, [string]$EnvironmentDigest, [bool]$RequireAudit) {
  $manifest = $Record.Manifest
  $baseCommit = Require-Text $manifest "baseCommit" "Work Unit package record"
  $contractRevision = Require-Text $manifest "contractRevision" "Work Unit package record"
  $evidenceRefs = @(Get-Array $manifest "evidenceRefs" | ForEach-Object { "$_" })
  if ($evidenceRefs.Count -eq 0) { Fail "package-state Work Unit requires evidenceRefs" }
  $candidateRecordRef = Require-Text $manifest "candidateRecordRef" "Work Unit package record"
  if ($evidenceRefs -notcontains $candidateRecordRef) { Fail "candidateRecordRef must be one of evidenceRefs" }
  $evidenceEntries = @()
  foreach ($ref in $evidenceRefs) {
    $entry = Read-StrictRecord $ref "Package evidence record" @("governance/execution/evidence")
    $record = $entry.Record
    Assert-RecordValue $record "recordType" "EVIDENCE" "Package evidence record"
    Assert-RecordValue $record "trainId" $Record.TrainId "Package evidence record"
    Assert-RecordValue $record "workUnitId" $Record.WorkUnitId "Package evidence record"
    Assert-RecordValue $record "candidateCommit" $CandidateCommit "Package evidence record"
    Assert-RecordValue $record "candidateDigest" $CandidateDigest "Package evidence record"
    Assert-RecordValue $record "candidateDigestAlgorithm" "GIT_COMMIT_TREE_SHA256_V1" "Package evidence record"
    Assert-RecordValue $record "baseCommit" $baseCommit "Package evidence record"
    Assert-RecordValue $record "contractRevision" $contractRevision "Package evidence record"
    Assert-RecordValue $record "environmentDigest" $EnvironmentDigest "Package evidence record"
    if ((Require-Text $record "result" "Package evidence record").ToUpperInvariant() -ne "PASS") { Fail "Package evidence record result must be PASS" }
    if ($ref -eq $candidateRecordRef) {
      $checks = @(Get-Array $record "checks" | ForEach-Object { "$_".ToUpperInvariant() })
      if ($checks -notcontains "CLEAN_WORKTREE_RECORDED" -or $checks -notcontains "IMMUTABLE_COMMIT_VERIFIED") { Fail "candidate record lacks clean immutable package checks" }
    }
    $evidenceEntries += $entry
  }
  Assert-RecordBindingSet (Get-OptionalValue $manifest "evidenceBindings") $evidenceEntries "Package evidence"
  if (-not $RequireAudit) { return }
  $auditRefs = @(Get-Array $manifest "auditRefs" | ForEach-Object { "$_" })
  if ($auditRefs.Count -eq 0) { Fail "audited/queued package requires auditRefs" }
  $auditEntries = @()
  foreach ($ref in $auditRefs) {
    $entry = Read-StrictRecord $ref "Package independent audit record" @("governance/execution/evidence")
    $record = $entry.Record
    Assert-RecordValue $record "recordType" "INDEPENDENT_AUDIT" "Package independent audit record"
    Assert-RecordValue $record "trainId" $Record.TrainId "Package independent audit record"
    Assert-RecordValue $record "workUnitId" $Record.WorkUnitId "Package independent audit record"
    Assert-RecordValue $record "candidateCommit" $CandidateCommit "Package independent audit record"
    Assert-RecordValue $record "candidateDigest" $CandidateDigest "Package independent audit record"
    Assert-RecordValue $record "candidateDigestAlgorithm" "GIT_COMMIT_TREE_SHA256_V1" "Package independent audit record"
    Assert-RecordValue $record "baseCommit" $baseCommit "Package independent audit record"
    Assert-RecordValue $record "contractRevision" $contractRevision "Package independent audit record"
    Assert-RecordValue $record "environmentDigest" $EnvironmentDigest "Package independent audit record"
    Assert-IndependentAuditRecord $record "PACKAGE_EVIDENCE_BINDINGS_VERIFIED" "Package independent audit record"
    $auditEvidenceRefs=@(Get-Array $record "evidenceRefs"|ForEach-Object{"$_"}|Sort-Object)
    if (@(Compare-Object @($evidenceRefs|Sort-Object) $auditEvidenceRefs).Count -gt 0) { Fail "independent audit evidenceRefs do not exactly bind Manifest evidenceRefs" }
    Assert-RecordBindingSet (Get-OptionalValue $record "evidenceBindings") $evidenceEntries "Audit evidence"
    $auditEntries += $entry
  }
  Assert-RecordBindingSet (Get-OptionalValue $manifest "auditBindings") $auditEntries "Package independent audit"
}

function Assert-ExecutionEnabled($Registry) {
  $system = (Require-Text $Registry "executionSystemStatus" "Release Train Registry").ToUpperInvariant()
  $enabled = (Require-Text $Registry "enablementStatus" "Release Train Registry").ToUpperInvariant()
  if ($system -ne "ENABLED" -or $enabled -ne "ENABLED") { Fail "execution system is NOT_ENABLED; no WorkUnit mode may emit eligibility" }
}

function Assert-QueueOpenState([bool]$AcceptingItems, [object[]]$Items) {
  if (-not $AcceptingItems -and $Items.Count -gt 0) { Fail "Integration Queue acceptingItems=false requires an empty items array" }
}

function Assert-UniqueValues([object[]]$Items, [string]$Property, [string]$Label) {
  $seen = @{}
  foreach ($item in $Items) {
    $value = Require-Text $item $Property $Label
    $key = $value.ToLowerInvariant()
    if ($seen.ContainsKey($key)) { Fail "$Label has duplicate $Property including terminal history: $value" }
    $seen[$key] = $true
  }
}

function Get-ManifestRecords {
  if (-not (Test-ControlDirectory $WorkUnitsRoot)) {
    Fail "missing canonical Work Unit directory at $WorkUnitsRoot"
  }
  $records = @()
  foreach ($manifestRef in @(Get-ControlFileRefs "governance/execution/work-units"|Where-Object{$_-match'^governance/execution/work-units/[^/]+\.json$'}|Sort-Object)) {
    $manifestPath=Join-Path $Root $manifestRef;$manifestName=Split-Path $manifestRef -Leaf
    $manifest = Read-Json $manifestPath "Work Unit Manifest"
    $label = "Work Unit Manifest $manifestName"
    Assert-StrictManifest $manifest $label
    Require-SchemaVersion $manifest 1 $label
    $trainId = Require-Text $manifest "trainId" $label
    $workUnitId = Require-Text $manifest "workUnitId" $label
    $status = (Require-Text $manifest "status" $label).ToUpperInvariant()
    if ($status -notin $AllowedWorkUnitStatuses) { Fail "$label has unsupported status $status" }
    $workUnitTransitions = @{
      NONE=@("PLANNED"); PLANNED=@("WAITING_DEPENDENCY","CONTRACT_FROZEN","BLOCKED","ABANDONED");
      WAITING_DEPENDENCY=@("CONTRACT_FROZEN","BLOCKED","ABANDONED"); CONTRACT_FROZEN=@("CONSTRUCTION_AUTHORIZED","BLOCKED","ABANDONED");
      CONSTRUCTION_AUTHORIZED=@("IN_CONSTRUCTION","BLOCKED","ABANDONED"); IN_CONSTRUCTION=@("PACKAGE_VERIFIED","BLOCKED","ABANDONED");
      PACKAGE_VERIFIED=@("PACKAGE_AUDITED","STALE","BLOCKED"); PACKAGE_AUDITED=@("QUEUED","STALE","BLOCKED");
      QUEUED=@("INTEGRATED","STALE","BLOCKED"); INTEGRATED=@("CLOSED","BLOCKED");
      STALE=@("IN_CONSTRUCTION","ABANDONED"); BLOCKED=@("WAITING_DEPENDENCY","CONTRACT_FROZEN","IN_CONSTRUCTION","ABANDONED"); CLOSED=@(); ABANDONED=@()
    }
    Assert-StatusTransition (Require-Text $manifest "previousStatus" $label) $status $workUnitTransitions $label (Require-Text $manifest "statusChangedAt" $label) (Require-Text $manifest "transitionAuthorityRef" $label) "WORK_UNIT" $workUnitId $trainId $workUnitId
    $null = Require-Text $manifest "owner" $label
    $null = Require-Text $manifest "worktreePath" $label
    $null = Require-Text $manifest "branch" $label
    $null = Require-Text $manifest "baseCommit" $label
    $null = Require-Text $manifest "contractRevision" $label
    $environmentMember = $manifest.PSObject.Properties["environment"]
    if ($null -eq $environmentMember -or $null -eq $environmentMember.Value) { Fail "$label is missing required field 'environment'" }
    $environment = $environmentMember.Value
    foreach ($field in @(
      "composeProject", "mysqlDatabase", "mysqlPort", "redisNamespace", "redisPort",
      "backendPort", "customerPort", "workerPort", "adminPort"
    )) {
      $null = Require-Text $environment $field "$label environment"
    }
    foreach ($portField in @("mysqlPort", "redisPort", "backendPort", "customerPort", "workerPort", "adminPort")) {
      $null = Require-Port $environment $portField "$label environment"
    }
    $composeOverrideRef = Normalize-RepoPath (Require-Text $environment "composeOverrideRef" "$label environment") "$label composeOverrideRef"
    if ($composeOverrideRef -ne 'governance/execution/templates/docker-compose.worktree.yml' -or
        -not (Test-ControlLeaf (Join-Path $Root $composeOverrideRef))) {
      Fail "$label composeOverrideRef must resolve to the canonical managed-worktree Compose template"
    }

    $allowedPaths = @(Get-Array $manifest "allowedPaths" | ForEach-Object {
      Normalize-RepoPath "$_" "$label allowedPaths"
    })
    $executionModeMember = $manifest.PSObject.Properties["executionMode"]
    $executionMode = if ($null -eq $executionModeMember) { "WRITE" } else { "$($executionModeMember.Value)".ToUpperInvariant() }
    $businessWriteMember = $manifest.PSObject.Properties["businessWriteAuthorized"]
    $businessWriteAuthorized = $null -ne $businessWriteMember -and $businessWriteMember.Value -eq $true
    $serialWriter = Get-SerialCanonicalWriterDeclaration $manifest $label
    if ($allowedPaths.Count -eq 0 -and ($executionMode -ne "VALIDATION_ONLY" -or $businessWriteAuthorized)) {
      Fail "$label must declare at least one allowedPaths lease"
    }
    $forbiddenPaths = @(Get-Array $manifest "forbiddenPaths" | ForEach-Object {
      if ("$_" -eq "**" -and $executionMode -eq "VALIDATION_ONLY" -and -not $businessWriteAuthorized) { "**" }
      else { Normalize-RepoPath "$_" "$label forbiddenPaths" }
    })
    $semanticOwnership = @(Get-Array $manifest "semanticOwnership" | ForEach-Object {
      if ([string]::IsNullOrWhiteSpace("$_")) { Fail "$label contains blank semanticOwnership" }
      "$_".Trim().ToLowerInvariant()
    })
    if ($semanticOwnership.Count -eq 0) { Fail "$label must declare semanticOwnership (use an explicit non-authority token when none applies)" }

    foreach ($allowed in $allowedPaths) {
      foreach ($forbidden in $forbiddenPaths) {
        if ($forbidden -eq "**") { continue }
        if (Test-PrefixOverlap $allowed $forbidden) {
          Fail "$label has overlapping allowed/forbidden path leases: $allowed <> $forbidden"
        }
      }
    }

    $records += [pscustomobject]@{
      File = $manifestPath
      Manifest = $manifest
      TrainId = $trainId
      WorkUnitId = $workUnitId
      Status = $status
      Active = $status -notin $InactiveWorkUnitStatuses
      ExecutionMode = $executionMode
      BusinessWriteAuthorized = $businessWriteAuthorized
      IsSerialCanonicalWriter = $serialWriter.IsSerial
      CanonicalWriterKey = $serialWriter.Key
      CanonicalWriterLeaseId = $serialWriter.LeaseId
      WorktreePath = "$($manifest.worktreePath)"
      Environment = $environment
      AllowedPaths = $allowedPaths
      ForbiddenPaths = $forbiddenPaths
      SemanticOwnership = $semanticOwnership
    }
  }
  return $records
}

function Test-BaseAuthority($Object, [string]$Label) {
  $baseCommit = Require-Text $Object "baseCommit" $Label
  if ($baseCommit -notmatch '^[0-9a-fA-F]{40}$') { Fail "$Label baseCommit must be a full 40-character commit hash" }
  $objectType = (Invoke-Git $Root @("cat-file", "-t", $baseCommit) | Select-Object -First 1).Trim()
  if ($objectType -ne "commit") { Fail "$Label baseCommit is not a commit object: $baseCommit ($objectType)" }
  $resolvedCommit = (Invoke-Git $Root @("rev-parse", "$baseCommit^{commit}") | Select-Object -First 1).Trim()
  if ($resolvedCommit -ne $baseCommit.ToLowerInvariant()) { Fail "$Label baseCommit does not resolve to itself" }

  $baseTag = Get-OptionalValue $Object "baseTag"
  if ($null -ne $baseTag -and -not [string]::IsNullOrWhiteSpace("$baseTag")) {
    $peeled = (Invoke-Git $Root @("rev-parse", "$baseTag^{}") | Select-Object -First 1).Trim()
    if ($peeled -ne $resolvedCommit) { Fail "$Label baseTag $baseTag peels to $peeled, not $resolvedCommit" }
    $baseTagObject = Get-OptionalValue $Object "baseTagObject"
    if ($null -ne $baseTagObject -and -not [string]::IsNullOrWhiteSpace("$baseTagObject")) {
      if ("$baseTagObject" -notmatch '^[0-9a-fA-F]{40}$') { Fail "$Label baseTagObject must be a full 40-character object hash" }
      $tagType = (Invoke-Git $Root @("cat-file", "-t", "$baseTagObject") | Select-Object -First 1).Trim()
      if ($tagType -ne "tag") { Fail "$Label baseTagObject is not an annotated tag object: $baseTagObject ($tagType)" }
      $actualTagObject = (Invoke-Git $Root @("rev-parse", "$baseTag") | Select-Object -First 1).Trim()
      if ($actualTagObject -ne "$baseTagObject".ToLowerInvariant()) {
        Fail "$Label baseTag object mismatch: registry=$baseTagObject actual=$actualTagObject"
      }
    }
  } elseif ($null -ne (Get-OptionalValue $Object "baseTagObject")) {
    Fail "$Label declares baseTagObject without baseTag"
  }
  return $resolvedCommit
}

function Get-WorkUnitReachableStatuses($Record) {
  $path=$Record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/');$statuses=@{}
  foreach($commit in @(Invoke-Git $Root @("rev-list",(Get-ControlCommit),"--full-history","--",$path))){
    if(@(Invoke-Git $Root @("ls-tree",$commit,"--",$path)).Count-eq0){continue}
    $historical=Read-GitJson $commit $path "Work Unit reachable-status history"
    if((Require-Text $historical "workUnitId" "Work Unit reachable-status history")-ne$Record.WorkUnitId-or(Require-Text $historical "trainId" "Work Unit reachable-status history")-ne$Record.TrainId){Fail "Work Unit reachable-status history changed identity at $commit"}
    $statuses[(Require-Text $historical "status" "Work Unit reachable-status history").ToUpperInvariant()]=$true
  }
  return @($statuses.Keys)
}

function Test-RepositoryGovernance {
  foreach ($path in @(
    (Join-Path $Root "governance/01_PROJECT_CONSTITUTION_DRAFT.md"),
    (Join-Path $Root "governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md"),
    $LeasesPath,
    $ReservationsPath,
    $TrainRegistryPath,
    $IntegrationQueuePath
  )) {
    if (-not (Test-ControlLeaf $path)) { Fail "missing canonical governance artifact at control commit $(Get-ControlCommit): $path" }
  }
  Assert-AllCanonicalStrictRecordHistory

  $records = @(Get-ManifestRecords)
  $active = @($records | Where-Object { $_.Active })
  $identitySet = @{}
  $branchSet = @{}
  $worktreeSet = @{}
  foreach ($record in $records) {
    $identity = "$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()
    if ($identitySet.ContainsKey($identity)) { Fail "duplicate Work Unit identity: $identity" }
    $identitySet[$identity] = $record
    $branch = (Require-Text $record.Manifest "branch" "Work Unit $identity").ToLowerInvariant()
    $worktree = $record.WorktreePath.Replace('\', '/').ToLowerInvariant()
    if ($branchSet.ContainsKey($branch)) { Fail "duplicate Work Unit branch: $branch" }
    if ($worktreeSet.ContainsKey($worktree)) { Fail "duplicate Work Unit worktreePath: $worktree" }
    $branchSet[$branch] = $true
    $worktreeSet[$worktree] = $true
  }

  $trainRegistry = Read-Json $TrainRegistryPath "Release Train Registry"
  Assert-StrictTrainRegistry $trainRegistry
  Require-SchemaVersion $trainRegistry 1 "Release Train Registry"
  $executionSystemStatus = (Require-Text $trainRegistry "executionSystemStatus" "Release Train Registry").ToUpperInvariant()
  $enablementStatus = (Require-Text $trainRegistry "enablementStatus" "Release Train Registry").ToUpperInvariant()
  if ($executionSystemStatus -notin @("BOOTSTRAP", "ENABLED", "DISABLED")) { Fail "unsupported executionSystemStatus $executionSystemStatus" }
  if ($enablementStatus -notin @("NOT_ENABLED", "ENABLED", "DISABLED")) { Fail "unsupported enablementStatus $enablementStatus" }
  $registryMaxWrite = [int](Require-Text $trainRegistry "maxConcurrentWriteWorkUnits" "Release Train Registry")
  if ($registryMaxWrite -lt 1 -or $registryMaxWrite -gt 3) { Fail "registry maxConcurrentWriteWorkUnits must be between 1 and 3" }
  $trains = @(Get-LedgerItems $trainRegistry "trains" "Release Train Registry")
  $trainSet = @{}
  foreach ($train in $trains) {
    $trainId = Require-Text $train "trainId" "Release Train Registry entry"
    $trainStatus = (Require-Text $train "status" "Release Train $trainId").ToUpperInvariant()
    if ($trainStatus -notin @(
      "PLANNED", "DRAFT", "VALIDATION_AUTHORIZED", "CHARTER_HUMAN_APPROVED", "ASSEMBLING", "TRAIN_VERIFIED",
      "HUMAN_ACCEPTED", "PHASE_LOCKS_COMPLETED", "CLOSED", "BLOCKED", "ABANDONED"
    )) { Fail "Release Train $trainId has unsupported status $trainStatus" }
    $identity = $trainId.ToLowerInvariant()
    if ($trainSet.ContainsKey($identity)) { Fail "duplicate Release Train identity: $trainId" }
    $charterRef = Normalize-RepoPath (Require-Text $train "charterRef" "Release Train $trainId") "Release Train $trainId charterRef"
    $charterPath = Join-Path $Root $charterRef
    if (-not (Test-ControlLeaf $charterPath)) { Fail "Release Train $trainId charterRef is missing: $charterRef" }
    $charterText = Read-ControlText $charterPath "Release Train $trainId charterRef"
    if ([string]::IsNullOrWhiteSpace($charterText)) { Fail "Release Train $trainId charterRef is empty: $charterRef" }
    $trainMode = (Require-Text $train "executionMode" "Release Train $trainId").ToUpperInvariant()
    if ($trainMode -notin @("VALIDATION_ONLY", "BUSINESS_CONSTRUCTION")) { Fail "Release Train $trainId has unsupported executionMode $trainMode" }
    if ($trainMode -eq "VALIDATION_ONLY" -and $charterRef -ne "governance/execution/README.md") { Fail "VALIDATION_ONLY Train must use the canonical execution README charter" }
    if ($trainMode -eq "BUSINESS_CONSTRUCTION" -and $charterRef -ne "governance/execution/trains/$($trainId)_CHARTER.md") { Fail "BUSINESS_CONSTRUCTION Train charterRef must be the exact canonical Train Charter path" }
    $null = Assert-CanonicalTrackedPath $charterRef "Release Train $trainId charterRef"
    $trainMaxWrite = [int](Require-Text $train "maxConcurrentWriteWorkUnits" "Release Train $trainId")
    if ($trainMaxWrite -lt 1 -or $trainMaxWrite -gt $registryMaxWrite) { Fail "Release Train $trainId maxConcurrentWriteWorkUnits exceeds registry limit" }
    if ($trainMode -eq "BUSINESS_CONSTRUCTION" -and -not $charterText.Contains($trainId)) {
      Fail "BUSINESS_CONSTRUCTION charterRef does not identify Train $trainId"
    }
    $null = Test-BaseAuthority $train "Release Train $trainId"
    $trainSet[$identity] = $train
  }
  Assert-EnablementAuthorityChain $trainRegistry $executionSystemStatus $enablementStatus $trains
  foreach ($train in $trains) { Assert-TrainAuthority $train $trainRegistry $executionSystemStatus $enablementStatus }
  foreach ($record in $records) {
    $trainKey = $record.TrainId.ToLowerInvariant()
    if (-not $trainSet.ContainsKey($trainKey)) { Fail "Work Unit $($record.WorkUnitId) references unregistered Train $($record.TrainId)" }
    $train = $trainSet[$trainKey]
    $manifestBase = Test-BaseAuthority $record.Manifest "Work Unit $($record.WorkUnitId)"
    $trainBase = Require-Text $train "baseCommit" "Release Train $($record.TrainId)"
    if ($manifestBase -ne $trainBase) { Fail "Work Unit $($record.WorkUnitId) baseCommit differs from its Train" }
    $manifestRelative = $record.File.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
    $workUnitRefs = @(Get-Array $train "workUnitRefs" | ForEach-Object { Normalize-RepoPath "$_" "Train workUnitRefs" })
    foreach ($ref in $workUnitRefs) {
      if ($ref -notmatch '^governance/execution/work-units/[^/]+\.json$') { Fail "Train workUnitRef is outside canonical work-units: $ref" }
    }
    if ($workUnitRefs -notcontains $manifestRelative) { Fail "Train $($record.TrainId) does not list Manifest $manifestRelative in workUnitRefs" }
    $trainMode = (Require-Text $train "executionMode" "Release Train $($record.TrainId)").ToUpperInvariant()
    if ($trainMode -ne $record.ExecutionMode) { Fail "Train/Work Unit executionMode mismatch for $($record.WorkUnitId)" }
    Assert-TrainWorkUnitAuthority $record $train $executionSystemStatus $enablementStatus
    if(($executionSystemStatus-eq"ENABLED"-and$enablementStatus-eq"ENABLED")-or($executionSystemStatus-eq"DISABLED"-and$enablementStatus-eq"DISABLED")){
      $previousWorkUnitStatus=Require-Text $record.Manifest "previousStatus" "Work Unit $($record.WorkUnitId)"
      $packageEvidenceClosureFields=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","candidateRecordRef","baseCommit","contractRevision","environmentDigest","evidenceRefs","evidenceBindings")
      $packageAuditClosureFields=@($packageEvidenceClosureFields+@("auditRefs","auditBindings"))
      $sameStatusClosureFields=if($record.Status-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED","STALE")){$packageAuditClosureFields}else{@()}
      $carryForwardFields=if($record.Status-eq"PACKAGE_AUDITED"){$packageEvidenceClosureFields}elseif($record.Status-in@("QUEUED","INTEGRATED","CLOSED","STALE")-or($record.Status-eq"BLOCKED"-and$previousWorkUnitStatus-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED"))-or($record.Status-eq"ABANDONED"-and$previousWorkUnitStatus-in@("STALE","BLOCKED"))){$packageAuditClosureFields}else{@()}
      Assert-StatusHistoryBinding $manifestRelative "WORK_UNIT" $record.WorkUnitId $record.Status $previousWorkUnitStatus (Require-Text $record.Manifest "statusChangedAt" "Work Unit $($record.WorkUnitId)") (Require-Text $record.Manifest "transitionAuthorityRef" "Work Unit $($record.WorkUnitId)") $record.TrainId $record.WorkUnitId (Require-Text $trainRegistry "auditedCandidateCommit" "Release Train Registry") $sameStatusClosureFields $carryForwardFields
    }
  }
  $allWorkUnitRefs = @($trains | ForEach-Object { Get-Array $_ "workUnitRefs" } | ForEach-Object { Normalize-RepoPath "$_" "Train workUnitRefs" })
  foreach ($ref in $allWorkUnitRefs) {
    if (-not (Test-ControlLeaf (Join-Path $Root $ref))) { Fail "dangling Train workUnitRef: $ref" }
  }
  $writeStatuses = @("CONSTRUCTION_AUTHORIZED", "IN_CONSTRUCTION")
  Assert-UniqueSerialCanonicalWriterReservations $records
  $activeParallelWrites = @($active | Where-Object { $_.ExecutionMode -eq "BUSINESS_CONSTRUCTION" -and $_.Status -in $writeStatuses -and $_.BusinessWriteAuthorized -and -not $_.IsSerialCanonicalWriter })
  if ($activeParallelWrites.Count -gt $registryMaxWrite) { Fail "active parallel WRITE Work Units exceed registry maximum $registryMaxWrite" }
  foreach ($train in $trains) {
    $trainId = "$($train.trainId)"
    $trainLimit = [int]$train.maxConcurrentWriteWorkUnits
    if (@($activeParallelWrites | Where-Object { $_.TrainId -eq $trainId }).Count -gt $trainLimit) { Fail "active parallel WRITE Work Units exceed Train $trainId maximum $trainLimit" }
  }
  for ($i = 0; $i -lt $active.Count; $i++) {
    for ($j = $i + 1; $j -lt $active.Count; $j++) {
      foreach ($left in $active[$i].AllowedPaths) {
        foreach ($right in $active[$j].AllowedPaths) {
          if (Test-PrefixOverlap $left $right) {
            Fail "active path lease collision: $($active[$i].WorkUnitId):$left <> $($active[$j].WorkUnitId):$right"
          }
        }
      }
      foreach ($left in $active[$i].SemanticOwnership) {
        if ($active[$j].SemanticOwnership -contains $left) {
          Fail "active semantic/canonical-writer collision: $left ($($active[$i].WorkUnitId), $($active[$j].WorkUnitId))"
        }
      }
    }
  }

  $leaseLedger = Read-Json $LeasesPath "Lease Ledger"
  Assert-StrictLeaseLedger $leaseLedger
  Require-SchemaVersion $leaseLedger 2 "Lease Ledger"
  $leases = @(Get-LedgerItems $leaseLedger "leases" "Lease Ledger")
  $activeLeases = @()
  $leaseIds = @{}
  $leaseById = @{}
  foreach ($lease in $leases) {
    $label = "Lease Ledger entry"
    $leaseId = Require-Text $lease "leaseId" $label
    $type = (Require-Text $lease "type" "$label $leaseId").ToUpperInvariant()
    if ($type -notin @("PATH", "WORKTREE_PATH", "SOURCE_PATH", "ENVIRONMENT", "PORT", "SEMANTIC", "CANONICAL_WRITER")) {
      Fail "lease $leaseId has unsupported type $type"
    }
    $key = Get-LeaseKey $lease "$label $leaseId"
    if ($type -eq "PATH") {
      $type = if ($key -match '^[A-Za-z]:[\\/]') { "WORKTREE_PATH" } else { "SOURCE_PATH" }
    }
    if ($type -eq "WORKTREE_PATH") { $key = Normalize-LeasePath $key "lease $leaseId" }
    elseif ($type -eq "SOURCE_PATH") { $key = Normalize-RepoPath $key "lease $leaseId" }
    else { $key = $key.ToLowerInvariant() }
    $resource = Get-OptionalValue $lease "resource"
    $value = Get-OptionalValue $lease "value"
    $resources = Get-OptionalValue $lease "resources"
    $ports = Get-OptionalValue $lease "ports"
    $portName = Get-OptionalValue $lease "portName"
    $port = Get-OptionalValue $lease "port"
    if ($type -eq "PORT") {
      $portName = (Require-Text $lease "portName" "$label $leaseId").ToLowerInvariant()
      if ($portName -notin @("mysql","redis","backend","customer","worker","admin")) { Fail "PORT lease $leaseId has unsupported portName $portName" }
      $port = Require-Port $lease "port" "$label $leaseId"
    }
    if ($null -ne $resource) { $resource = "$resource".Trim().ToLowerInvariant() }
    if ($null -ne $value) { $value = "$value".Trim().ToLowerInvariant() }
    $trainId = Require-Text $lease "trainId" "$label $leaseId"
    $workUnitId = Require-Text $lease "workUnitId" "$label $leaseId"
    $status = (Require-Text $lease "status" "$label $leaseId").ToUpperInvariant()
    if ($status -notin @("ACTIVE", "RELEASED", "EXPIRED", "CLOSED", "ABANDONED")) { Fail "lease $leaseId has unsupported status $status" }
    $normalizedId = $leaseId.ToLowerInvariant()
    if ($leaseIds.ContainsKey($normalizedId)) { Fail "duplicate leaseId: $leaseId" }
    $leaseIds[$normalizedId] = $true
    $protectedPaths = @()
    if ($type -eq "CANONICAL_WRITER") {
      $member = $lease.PSObject.Properties["protectedPaths"]
      if ($null -eq $member -or $member.Value -isnot [System.Array] -or @($member.Value).Count -eq 0) { Fail "CANONICAL_WRITER $leaseId must declare a non-empty protectedPaths array" }
      $seenProtected = @{}
      foreach ($path in @($member.Value)) {
        $normalizedPath = Normalize-RepoPath "$path" "CANONICAL_WRITER $leaseId protectedPaths"
        $pathKey = $normalizedPath.ToLowerInvariant()
        if ($seenProtected.ContainsKey($pathKey)) { Fail "CANONICAL_WRITER $leaseId has duplicate protected path $normalizedPath" }
        $seenProtected[$pathKey] = $true; $protectedPaths += $normalizedPath
      }
    } elseif ($null -ne (Get-OptionalValue $lease "protectedPaths")) { Fail "only CANONICAL_WRITER leases may declare protectedPaths" }
    if ($status -notin $InactiveLeaseStatuses) {
      $identity = "$trainId/$workUnitId".ToLowerInvariant()
      if (-not $identity.StartsWith("system-serial-lanes/") -and
          (-not $identitySet.ContainsKey($identity) -or -not $identitySet[$identity].Active)) {
        Fail "active lease $leaseId references missing or inactive Work Unit $identity"
      }
      $activeLease = [pscustomobject]@{
        Id=$leaseId; Type=$type; Key=$key; Resource=$resource; Value=$value
        Resources=$resources; Ports=$ports; PortName=$portName; Port=$port
        Paths=(Get-OptionalValue $lease "paths")
        ProtectedPaths=$protectedPaths
        Identity=$identity; TrainId=$trainId; WorkUnitId=$workUnitId
      }
      $activeLeases += $activeLease
      $leaseById[$normalizedId] = $activeLease
    }
  }

  for ($i = 0; $i -lt $activeLeases.Count; $i++) {
    for ($j = $i + 1; $j -lt $activeLeases.Count; $j++) {
      if ($activeLeases[$i].Type -eq $activeLeases[$j].Type -and
          $activeLeases[$i].Type -in @("WORKTREE_PATH", "SOURCE_PATH") -and
          (Test-PrefixOverlap $activeLeases[$i].Key $activeLeases[$j].Key)) {
        Fail "Lease Ledger path collision: $($activeLeases[$i].Id) <> $($activeLeases[$j].Id)"
      }
      if ($activeLeases[$i].Type -eq $activeLeases[$j].Type -and
          $activeLeases[$i].Type -in @("ENVIRONMENT", "PORT", "SEMANTIC", "CANONICAL_WRITER") -and
          $activeLeases[$i].Key -eq $activeLeases[$j].Key) {
        Fail "Lease Ledger exclusive resource collision: $($activeLeases[$i].Id) <> $($activeLeases[$j].Id)"
      }
      if ($activeLeases[$i].Type -eq "ENVIRONMENT" -and $activeLeases[$j].Type -eq "ENVIRONMENT") {
        $leftValues = if ($null -ne $activeLeases[$i].Resources) {
          @($activeLeases[$i].Resources.PSObject.Properties | ForEach-Object { "$($_.Value)".ToLowerInvariant() })
        } elseif ($null -ne $activeLeases[$i].Value) { @("$($activeLeases[$i].Value)".ToLowerInvariant()) } else { @() }
        $rightValues = if ($null -ne $activeLeases[$j].Resources) {
          @($activeLeases[$j].Resources.PSObject.Properties | ForEach-Object { "$($_.Value)".ToLowerInvariant() })
        } elseif ($null -ne $activeLeases[$j].Value) { @("$($activeLeases[$j].Value)".ToLowerInvariant()) } else { @() }
        foreach ($value in $leftValues) {
          if ($rightValues -contains $value) { Fail "ENVIRONMENT Lease value collision: $value" }
        }
      }
      if ($activeLeases[$i].Type -eq "PORT" -and $activeLeases[$j].Type -eq "PORT") {
        $leftPorts = if ($null -ne $activeLeases[$i].Ports) {
          @($activeLeases[$i].Ports.PSObject.Properties | ForEach-Object { [int]$_.Value })
        } elseif ($null -ne $activeLeases[$i].Port) { @([int]$activeLeases[$i].Port) }
        elseif ($null -ne $activeLeases[$i].Value) { @([int]$activeLeases[$i].Value) } else { @() }
        $rightPorts = if ($null -ne $activeLeases[$j].Ports) {
          @($activeLeases[$j].Ports.PSObject.Properties | ForEach-Object { [int]$_.Value })
        } elseif ($null -ne $activeLeases[$j].Port) { @([int]$activeLeases[$j].Port) }
        elseif ($null -ne $activeLeases[$j].Value) { @([int]$activeLeases[$j].Value) } else { @() }
        foreach ($port in $leftPorts) {
          if ($rightPorts -contains $port) { Fail "PORT Lease collision: tcp/$port" }
        }
      }
    }
  }
  Assert-CanonicalWriterProtection $activeParallelWrites $activeLeases
  foreach ($record in @($active | Where-Object { $_.IsSerialCanonicalWriter })) {
    Assert-SerialCanonicalWriterBinding $record $activeLeases
  }
  $trainContractAuthorities = @{}
  foreach ($train in $trains) {
    $trainId = Require-Text $train "trainId" "Release Train contract authority"
    $trainContractAuthorities[$trainId.ToLowerInvariant()] = Assert-TrainContractAuthority $train $activeLeases
  }
  $contractRequiredStatuses = @(
    "CONTRACT_FROZEN","CONSTRUCTION_AUTHORIZED","IN_CONSTRUCTION","PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED","STALE"
  )
  foreach ($record in $records | Where-Object { $_.ExecutionMode -eq "BUSINESS_CONSTRUCTION" -and $_.Status -in $contractRequiredStatuses }) {
    $authority = $trainContractAuthorities[$record.TrainId.ToLowerInvariant()]
    Assert-WorkUnitContractAuthority $record $authority
  }

  foreach ($record in $active) {
    $identity = "$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()
    $declaredWorktree = $record.WorktreePath.Replace('\', '/').TrimEnd('/')
    $leaseRefs = Get-OptionalValue $record.Manifest "leaseRefs"
    if ($null -eq $leaseRefs) { Fail "Manifest $($record.WorkUnitId) is missing leaseRefs" }
    $worktreeLeaseId = (Require-Text $leaseRefs "worktreePath" "Manifest leaseRefs").ToLowerInvariant()
    $sourceLeaseId = (Require-Text $leaseRefs "sourcePath" "Manifest leaseRefs").ToLowerInvariant()
    $environmentLeaseId = (Require-Text $leaseRefs "environment" "Manifest leaseRefs").ToLowerInvariant()
    foreach ($leaseId in @($worktreeLeaseId, $sourceLeaseId, $environmentLeaseId)) {
      if (-not $leaseById.ContainsKey($leaseId) -or $leaseById[$leaseId].Identity -ne $identity) { Fail "leaseRefs does not bind active Lease $leaseId to $identity" }
    }
    if ($leaseById[$worktreeLeaseId].Type -ne "WORKTREE_PATH" -or $leaseById[$worktreeLeaseId].Key -ne $declaredWorktree) {
      Fail "leaseRefs.worktreePath does not exactly bind Manifest worktreePath"
    }
    if ($leaseById[$sourceLeaseId].Type -ne "SOURCE_PATH") { Fail "leaseRefs.sourcePath must bind a SOURCE_PATH Lease" }
    $sourcePaths = @($leaseById[$sourceLeaseId].Paths | ForEach-Object { Normalize-RepoPath "$_" "SOURCE_PATH lease paths" })
    if (@(Compare-Object @($record.AllowedPaths | Sort-Object) @($sourcePaths | Sort-Object)).Count -gt 0) {
      Fail "leaseRefs.sourcePath paths do not exactly match Manifest allowedPaths"
    }
    if ($leaseById[$environmentLeaseId].Type -ne "ENVIRONMENT") { Fail "leaseRefs.environment must bind an ENVIRONMENT Lease" }
    $portRefs = Get-OptionalValue $leaseRefs "ports"
    if ($null -eq $portRefs) { Fail "Manifest leaseRefs is missing ports map" }
    $portLeaseIds = @{}
    foreach ($portName in @("mysql", "redis", "backend", "customer", "worker", "admin")) {
      $portLeaseId = (Require-Text $portRefs $portName "Manifest leaseRefs.ports").ToLowerInvariant()
      $portLeaseIds[$portName] = $portLeaseId
      if (-not $leaseById.ContainsKey($portLeaseId)) { Fail "leaseRefs.ports.$portName references missing active Lease" }
      $portLease = $leaseById[$portLeaseId]
      if ($portLease.Identity -ne $identity -or $portLease.Type -ne "PORT" -or "$($portLease.PortName)".ToLowerInvariant() -ne $portName) {
        Fail "leaseRefs.ports.$portName does not exactly bind its PORT Lease"
      }
    }
    if (-not @($activeLeases | Where-Object {
      $_.Identity -eq $identity -and $_.Type -eq "WORKTREE_PATH" -and $_.Key -eq $declaredWorktree
    }).Count) {
      Fail "Manifest worktreePath is not backed by active WORKTREE_PATH Lease: ${identity}:$declaredWorktree"
    }
    foreach ($path in $record.AllowedPaths) {
      if (-not @($activeLeases | Where-Object { $_.Identity -eq $identity -and $_.Type -eq "SOURCE_PATH" -and $_.Key -eq $path }).Count) {
        Fail "Manifest path lease is not backed by active Lease Ledger entry: ${identity}:$path"
      }
    }
    foreach ($semantic in $record.SemanticOwnership) {
      if (-not @($activeLeases | Where-Object { $_.Identity -eq $identity -and $_.Type -in @("SEMANTIC", "CANONICAL_WRITER") -and $_.Key -eq $semantic }).Count) {
        Fail "Manifest semanticOwnership is not backed by active Lease Ledger entry: ${identity}:$semantic"
      }
    }
    foreach ($field in @("composeProject", "mysqlDatabase", "redisNamespace")) {
      $expected = "$(Require-Text $record.Environment $field "Work Unit environment")".ToLowerInvariant()
      $namespaced = "$($field.ToLowerInvariant()):$expected"
      if (-not @($activeLeases | Where-Object {
        $_.Id.ToLowerInvariant() -eq $environmentLeaseId -and $_.Identity -eq $identity -and $_.Type -eq "ENVIRONMENT" -and
        ($_.Key -eq $expected -or $_.Key -eq $namespaced -or
         ($_.Resource -eq $field.ToLowerInvariant() -and $_.Value -eq $expected) -or
         ("$(Get-OptionalValue $_.Resources $field)".ToLowerInvariant() -eq $expected))
      }).Count) { Fail "environment.$field is not backed by an active ENVIRONMENT Lease: $expected" }
    }
    $portMap = @{
      mysqlPort="mysql"; redisPort="redis"; backendPort="backend"
      customerPort="customer"; workerPort="worker"; adminPort="admin"
    }
    foreach ($field in @("mysqlPort", "redisPort", "backendPort", "customerPort", "workerPort", "adminPort")) {
      $expected = "$(Require-Text $record.Environment $field "Work Unit environment")".ToLowerInvariant()
      $namespaced = "$($field.ToLowerInvariant()):$expected"
      $portResource = $portMap[$field]
      if (-not @($activeLeases | Where-Object {
        $_.Id.ToLowerInvariant() -eq $portLeaseIds[$portResource] -and $_.Identity -eq $identity -and $_.Type -eq "PORT" -and
        ($_.Key -eq $expected -or $_.Key -eq $namespaced -or
         ($_.Resource -eq $field.ToLowerInvariant() -and $_.Value -eq $expected) -or
         ("$(Get-OptionalValue $_.Ports $portResource)" -eq $expected) -or
         ("$($_.PortName)".ToLowerInvariant() -eq $portResource -and "$($_.Port)" -eq $expected))
      }).Count) { Fail "environment.$field is not backed by an active PORT Lease: $expected" }
    }
  }

  $reservationLedger = Read-Json $ReservationsPath "Migration Reservation Ledger"
  Assert-StrictReservationLedger $reservationLedger
  Require-SchemaVersion $reservationLedger 2 "Migration Reservation Ledger"
  $reservations = @(Get-LedgerItems $reservationLedger "reservations" "Migration Reservation Ledger")
  Assert-UniqueValues $reservations "number" "Migration Reservation Ledger"
  Assert-UniqueValues $reservations "expectedFilename" "Migration Reservation Ledger"
  $numbers = @{}
  $filenames = @{}
  $existingMigrations = Get-MigrationRepositoryIndex $Root
  $lockedMigrationChanges = @()
  $lockedMigrationChanges += Invoke-Git $Root @("diff", "--no-renames", "--name-only", "xlb-phase29-marketing-coupon^{}", (Get-ControlCommit), "--", "db/migrations")
  if($script:ControlCommit-eq"HEAD"){
    $lockedMigrationChanges += Invoke-Git $Root @("diff", "--no-renames", "--name-only", "--", "db/migrations")
    $lockedMigrationChanges += Invoke-Git $Root @("diff", "--cached", "--no-renames", "--name-only", "--", "db/migrations")
  }
  foreach ($path in @($lockedMigrationChanges | Sort-Object -Unique)) {
    if ($path -match '^db/migrations/(\d{3})[_-]' -and [int]$Matches[1] -le 57) {
      Fail "locked migration 000-057 differs from the canonical Phase29 tree: $path"
    }
  }
  $lockedMigrationBase=(Invoke-Git $Root @("rev-parse","xlb-phase29-marketing-coupon^{}")|Select-Object -First 1).Trim()
  Assert-LockedMigrationDag $lockedMigrationBase
  foreach ($reservation in $reservations) {
    $label = "Migration Reservation"
    $number = Require-Text $reservation "number" $label
    $filename = Require-Text $reservation "expectedFilename" "$label $number"
    $trainId = Require-Text $reservation "trainId" "$label $number"
    $workUnitId = Require-Text $reservation "workUnitId" "$label $number"
    $null = Require-Text $reservation "owner" "$label $number"
    $baseCommit = Require-Text $reservation "baseCommit" "$label $number"
    if ($baseCommit -notmatch '^[0-9a-fA-F]{40}$') { Fail "reservation $number baseCommit must be a full commit hash" }
    $baseType = (Invoke-Git $Root @("cat-file", "-t", $baseCommit) | Select-Object -First 1).Trim()
    if ($baseType -ne "commit") { Fail "reservation $number baseCommit is not a commit object" }
    $status = (Require-Text $reservation "status" "$label $number").ToUpperInvariant()
    $createdAtText=Require-Text $reservation "createdAt" "$label $number";$reason=Require-Text $reservation "reason" "$label $number"
    [string[]]$reservationTimeFormats=@("yyyy-MM-dd'T'HH:mm:sszzz","yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz","yyyy-MM-dd'T'HH:mm:ss'Z'","yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'")
    $createdAt=[DateTimeOffset]::MinValue;if(-not[DateTimeOffset]::TryParseExact($createdAtText,$reservationTimeFormats,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$createdAt)){Fail "reservation $number createdAt must be strict ISO-8601"}
    $closedMember=$reservation.PSObject.Properties["closedAt"];if($null-eq$closedMember){Fail "reservation $number is missing required closedAt"};$closedText=if($null-eq$closedMember.Value){""}else{"$($closedMember.Value)".Trim()}
    if($status-in@("MERGED","ABANDONED")){$closedAt=[DateTimeOffset]::MinValue;if(-not[DateTimeOffset]::TryParseExact($closedText,$reservationTimeFormats,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal,[ref]$closedAt)-or$closedAt-lt$createdAt){Fail "terminal reservation $number requires closedAt >= createdAt"}}
    elseif(-not[string]::IsNullOrWhiteSpace($closedText)){Fail "active reservation $number must keep closedAt=null"}
    $isPermanentGap = $number -eq "024" -and $status -eq "ABANDONED" -and $filename -eq "NONE_PERMANENT_GAP_024"
    if ($null -eq $reservation.PSObject.Properties["tables"] -or $reservation.tables -isnot [System.Array] -or (@($reservation.tables).Count -eq 0 -and -not $isPermanentGap)) { Fail "reservation $number must declare a non-empty tables array unless it is the permanent 024 gap" }
    $tableNames=@($reservation.tables|ForEach-Object{"$_"});if(@($tableNames|Sort-Object -Unique).Count-ne$tableNames.Count-or@($tableNames|Where-Object{$_-notmatch'^[a-z][a-z0-9_]*$'}).Count-gt0){Fail "reservation $number tables must be unique canonical table names"}
    $null = Require-Text $reservation "semanticScope" "$label $number"
    if ($status -notin @("RESERVED", "MATERIALIZED", "MERGED", "ABANDONED")) { Fail "reservation $number has unsupported status $status" }
    if ($number -notmatch '^\d{3}$') { Fail "migration reservation number must be three digits: $number" }
    if ($status -ne "ABANDONED" -and $filename -notmatch "^$([regex]::Escape($number))[_-].*\.sql$") { Fail "reservation filename must begin with its number and end in .sql" }
    if ($status -eq "ABANDONED" -and -not $isPermanentGap -and $filename -notmatch "^(RESERVED_GAP_$([regex]::Escape($number))|$([regex]::Escape($number))[_-].*\.sql)$") { Fail "ABANDONED reservation filename must preserve its number" }
    if ($numbers.ContainsKey($number)) { Fail "duplicate migration reservation number (including terminal history): $number" }
    if ($filenames.ContainsKey($filename.ToLowerInvariant())) { Fail "duplicate migration reservation filename (including terminal history): $filename" }
    $numbers[$number] = $true
    $filenames[$filename.ToLowerInvariant()] = $true
    if ($existingMigrations.ContainsKey($number)) {
      if ($status -ne "MERGED" -or $filename -ne $existingMigrations[$number]) {
        Fail "reservation $number reuses locked migration number owned by $($existingMigrations[$number])"
      }
    } elseif ($status -in @("MATERIALIZED","MERGED")) {
      Fail "$status reservation $number has no matching migration file"
    }
    $identity = "$trainId/$workUnitId".ToLowerInvariant()
    if ($identitySet.ContainsKey($identity)) {
      $record = $identitySet[$identity]
      if ($record.Manifest.baseCommit -ne $baseCommit) { Fail "reservation $number baseCommit differs from Work Unit base" }
      $train = $trainSet[$trainId.ToLowerInvariant()]
      if ($null -eq $train -or $train.baseCommit -ne $baseCommit) { Fail "reservation $number baseCommit differs from Train base" }
    } elseif ($status -notin $InactiveReservationStatuses) {
      $identity = "$trainId/$workUnitId".ToLowerInvariant()
      Fail "active migration reservation $number references missing Work Unit $identity"
    }
    if([int]$number-gt57-and$existingMigrations.ContainsKey($number)){
      if(-not$identitySet.ContainsKey($identity)){Fail "merged migration $filename lacks its permanent Work Unit authority record"}
      if($identitySet[$identity].Status-notin@("INTEGRATED","CLOSED")){Fail "merged migration $filename requires its Work Unit to be INTEGRATED or CLOSED, not $($identitySet[$identity].Status)"}
    }
  }
  Assert-ReservationLedgerHistory $reservations
  foreach ($entry in $existingMigrations.GetEnumerator() | Where-Object { [int]$_.Key -gt 57 }) {
    $match = @($reservations | Where-Object { "$($_.number)" -eq $entry.Key -and "$($_.expectedFilename)" -eq $entry.Value -and "$($_.status)".ToUpperInvariant() -in @("MATERIALIZED", "MERGED") })
    if ($match.Count -ne 1) { Fail "migration file has no unique materialized/merged reservation: $($entry.Value)" }
  }

  $workUnitStatusHistory=@{};foreach($record in $records){$workUnitStatusHistory["$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()]=@(Get-WorkUnitReachableStatuses $record)}
  foreach ($record in $records | Where-Object { $history=@($workUnitStatusHistory["$($_.TrainId)/$($_.WorkUnitId)".ToLowerInvariant()]);$_.Status-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED")-or@($history|Where-Object{$_-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED")}).Count-gt0 }) {
    $historyStatuses=@($workUnitStatusHistory["$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()]);$retainedTerminalPackage=$record.Status-in@("CLOSED","STALE","BLOCKED","ABANDONED")
    $manifestRelative=$record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
    $null=Assert-CanonicalTrackedPath $manifestRelative "Package-state Work Unit Manifest"
    $null=Assert-CanonicalTrackedPath "governance/execution/leases.json" "Package-state Lease Ledger"
    $candidateCommit = Require-Text $record.Manifest "candidateCommit" "Work Unit $($record.WorkUnitId)"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or
        (Invoke-Git $Root @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim() -ne "commit") {
      Fail "Work Unit $($record.WorkUnitId) candidateCommit must be an immutable commit object"
    }
    if(-not$retainedTerminalPackage){Assert-LiveCandidateWorktree $record $candidateCommit}
    $digest = Require-Text $record.Manifest "candidateDigest" "Work Unit $($record.WorkUnitId)"
    $actualDigest = Assert-CandidateDigestBinding $candidateCommit $digest (Require-Text $record.Manifest "candidateDigestAlgorithm" "Work Unit $($record.WorkUnitId)") "Work Unit $($record.WorkUnitId)"
    $environmentDigest = if($retainedTerminalPackage){(Require-Text $record.Manifest "environmentDigest" "retained package Work Unit $($record.WorkUnitId)").ToLowerInvariant()}else{Get-EnvironmentDigest $record $leaseById}
    if (-not$retainedTerminalPackage-and(Require-Text $record.Manifest "environmentDigest" "Work Unit $($record.WorkUnitId)").ToLowerInvariant() -ne $environmentDigest) { Fail "environmentDigest does not match Manifest, Lease, port, and Compose inputs" }
    if ($record.ExecutionMode -eq "BUSINESS_CONSTRUCTION") {
      $contractAuthority = $trainContractAuthorities[$record.TrainId.ToLowerInvariant()]
      Assert-WorkUnitContractAuthority $record $contractAuthority $candidateCommit
    }
    $requirePackageAudit=$record.Status-in@("PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED")-or@($historyStatuses|Where-Object{$_-in@("PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED")}).Count-gt0
    Assert-PackageRecordBindings $record $candidateCommit $actualDigest $environmentDigest $requirePackageAudit
    $baseCommit = Require-Text $record.Manifest "baseCommit" "Work Unit base"
    $migrationDiff = @(Invoke-Git $Root @("diff", "--no-renames", "--name-only", $baseCommit, $candidateCommit, "--", "db/migrations"))
    foreach ($path in $migrationDiff) {
      if ($path -notmatch '^db/migrations/(\d{3})[_-].*\.sql$') { Fail "candidate has noncanonical migration path: $path" }
      $number = $Matches[1]
      & git -C $Root cat-file -e "$baseCommit`:$path" 2>$null
      if ($LASTEXITCODE -eq 0) { Fail "candidate modifies migration already present at base: $path" }
      $match = @($reservations | Where-Object {
        "$($_.number)" -eq $number -and "db/migrations/$($_.expectedFilename)" -eq $path -and
        "$($_.trainId)" -eq $record.TrainId -and "$($_.workUnitId)" -eq $record.WorkUnitId
      })
      if ($match.Count -ne 1) { Fail "candidate migration lacks its unique reservation: $path" }
      Assert-PackageMigrationReservationStatus $record.Status (Require-Text $match[0] "status" "candidate migration reservation") $path ($historyStatuses-contains"INTEGRATED")
    }
  }

  $queue = Read-Json $IntegrationQueuePath "Integration Queue"
  Assert-StrictQueue $queue
  Require-SchemaVersion $queue 1 "Integration Queue"
  $queueSystemStatus = (Require-Text $queue "executionSystemStatus" "Integration Queue").ToUpperInvariant()
  $queueEnablement = (Require-Text $queue "enablementStatus" "Integration Queue").ToUpperInvariant()
  if ($queueSystemStatus -ne $executionSystemStatus -or $queueEnablement -ne $enablementStatus) {
    Fail "Integration Queue execution/enablement status must match Train Registry"
  }
  $queueTransitions = @{ NONE=@("NOT_ENABLED"); NOT_ENABLED=@("ENABLED"); ENABLED=@("DISABLED"); DISABLED=@("ENABLED") }
  Assert-StatusTransition (Require-Text $queue "previousEnablementStatus" "Integration Queue") $queueEnablement $queueTransitions "Integration Queue" (Require-Text $queue "statusChangedAt" "Integration Queue") (Require-Text $queue "transitionAuthorityRef" "Integration Queue") "INTEGRATION_QUEUE" "INTEGRATION_QUEUE"
  if($executionSystemStatus-in@("ENABLED","DISABLED")){Assert-StatusHistoryBinding "governance/execution/integration-queue.json" "INTEGRATION_QUEUE" "INTEGRATION_QUEUE" $queueEnablement (Require-Text $queue "previousEnablementStatus" "Integration Queue") (Require-Text $queue "statusChangedAt" "Integration Queue") (Require-Text $queue "transitionAuthorityRef" "Integration Queue") "" "" (Require-Text $trainRegistry "auditedCandidateCommit" "Release Train Registry")}
  $acceptingItems = (Get-OptionalValue $queue "acceptingItems") -eq $true
  $queueItems = @(Get-LedgerItems $queue "items" "Integration Queue")
  Assert-AllQueueItemHistoryBindings $identitySet $queue
  Assert-QueueOpenState $acceptingItems $queueItems
  if (($executionSystemStatus -ne "ENABLED" -or $enablementStatus -ne "ENABLED") -and ($acceptingItems -or $queueItems.Count -gt 0)) {
    Fail "NOT_ENABLED execution system requires queue acceptingItems=false and no items"
  }
  $sequences = @{}
  $queuedIdentity = @{}
  foreach ($item in $queueItems) {
    $sequence = [int](Require-Text $item "sequence" "Integration Queue item")
    if ($sequence -lt 1 -or $sequences.ContainsKey($sequence)) { Fail "Integration Queue sequence must be positive and unique: $sequence" }
    $sequences[$sequence] = $true
    $trainId = Require-Text $item "trainId" "Integration Queue item $sequence"
    $workUnitId = Require-Text $item "workUnitId" "Integration Queue item $sequence"
    $identity = "$trainId/$workUnitId".ToLowerInvariant()
    if ($queuedIdentity.ContainsKey($identity)) { Fail "Work Unit has multiple Integration Queue items: $identity" }
    if (-not $identitySet.ContainsKey($identity)) { Fail "Integration Queue item references unregistered Work Unit $identity" }
    $record = $identitySet[$identity]
    if ($record.Status -ne "QUEUED") { Fail "Integration Queue item requires Work Unit status QUEUED: $identity" }
    if ((Require-Text $item "status" "Integration Queue item $sequence").ToUpperInvariant() -ne "QUEUED") { Fail "Integration Queue item status must be QUEUED" }
    $submittedAt=[DateTimeOffset]::MinValue;if(-not[DateTimeOffset]::TryParse((Require-Text $item "submittedAt" "Integration Queue item $sequence"),[ref]$submittedAt)){Fail "Integration Queue item submittedAt must be an ISO timestamp"}
    $candidateCommit = Require-Text $item "candidateCommit" "Integration Queue item $sequence"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or
        (Invoke-Git $Root @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim() -ne "commit") {
      Fail "Integration Queue candidateCommit must be an immutable commit object"
    }
    if ((Require-Text $record.Manifest "candidateCommit" "QUEUED Work Unit") -ne $candidateCommit) { Fail "queue/Manifest candidateCommit mismatch" }
    $actualDigest = Assert-CandidateDigestBinding $candidateCommit (Require-Text $item "candidateDigest" "Integration Queue item $sequence") (Require-Text $item "candidateDigestAlgorithm" "Integration Queue item $sequence") "Integration Queue item $sequence"
    foreach ($field in @("baseCommit","contractRevision","environmentDigest","candidateRecordRef")) {
      if ((Require-Text $item $field "Integration Queue item $sequence") -ne (Require-Text $record.Manifest $field "QUEUED Work Unit")) { Fail "queue/Manifest $field mismatch" }
    }
    foreach ($field in @("evidenceRefs","auditRefs")) {
      $left = @(Get-Array $item $field | ForEach-Object { "$_" } | Sort-Object)
      $right = @(Get-Array $record.Manifest $field | ForEach-Object { "$_" } | Sort-Object)
      if (@(Compare-Object $left $right).Count -gt 0) { Fail "queue/Manifest $field mismatch" }
    }
    foreach ($field in @("evidenceBindings","auditBindings")) {
      if ((ConvertTo-CanonicalJsonText (Get-OptionalValue $item $field)) -cne (ConvertTo-CanonicalJsonText (Get-OptionalValue $record.Manifest $field))) { Fail "queue/Manifest $field mismatch" }
    }
    $queueItemTransitions = @{ PACKAGE_AUDITED=@("QUEUED") }
    Assert-StatusTransition (Require-Text $item "previousStatus" "Integration Queue item $sequence") "QUEUED" $queueItemTransitions "Integration Queue item $sequence" (Require-Text $item "statusChangedAt" "Integration Queue item $sequence") (Require-Text $item "transitionAuthorityRef" "Integration Queue item $sequence") "QUEUE_ITEM" "$trainId/$workUnitId/$sequence" $trainId $workUnitId
    if($executionSystemStatus-in@("ENABLED","DISABLED")-and$enablementStatus-in@("ENABLED","DISABLED")){Assert-QueueItemHistoryBinding $item $record $sequence (Require-Text $trainRegistry "auditedCandidateCommit" "Release Train Registry")}
    $queueWorktree = Require-Text $record.Manifest "worktreePath" "QUEUED Work Unit"
    if (-not (Test-Path -LiteralPath $queueWorktree -PathType Container)) { Fail "queue requires the candidate Work Unit worktree to exist for live clean-tree verification" }
    $liveHead = (Invoke-Git $queueWorktree @("rev-parse", "HEAD^{commit}") | Select-Object -First 1).Trim()
    $liveStatus = @(& git -C $queueWorktree status --porcelain=v1 -z --untracked-files=all 2>&1)
    if ($LASTEXITCODE -ne 0 -or $liveHead -ne $candidateCommit -or -not [string]::IsNullOrWhiteSpace(($liveStatus -join ""))) { Fail "queue candidate is not the clean immutable Work Unit HEAD" }
    $queuedIdentity[$identity] = $true
  }
  $nextSequence = [int](Require-Text $queue "nextSequence" "Integration Queue")
  $maxSequence = if ($sequences.Count -eq 0) { 0 } else { ($sequences.Keys | Measure-Object -Maximum).Maximum }
  if ($nextSequence -le $maxSequence) { Fail "Integration Queue nextSequence must be greater than every existing sequence" }
  foreach ($record in $records | Where-Object { $_.Status -eq "QUEUED" }) {
    $identity = "$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()
    if (-not $acceptingItems -or -not $queuedIdentity.ContainsKey($identity)) { Fail "QUEUED Work Unit lacks one accepting Integration Queue item: $identity" }
  }
  Assert-TrainWorkUnitClosureConsistency $trains $records $activeLeases $queueItems $reservations

  Write-Host "check-managed-worktree-boundaries: Repository passed ($($records.Count) manifests, $($activeLeases.Count) active leases, $($reservations.Count) reservations)"
  return [pscustomobject]@{
    Records=$records; ActiveLeases=$activeLeases; Reservations=$reservations
    TrainRegistry=$trainRegistry; Trains=$trains; TrainSet=$trainSet; Queue=$queue; QueueItems=$queueItems
  }
}

function Invoke-Git([string]$Directory, [string[]]$Arguments) {
  $output = @(& git -C $Directory @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "git $($Arguments -join ' ') failed in ${Directory}: $($output -join ' ')" }
  return @($output | ForEach-Object { "$_" })
}

function Test-WorkUnitBoundary($RepositoryState) {
  if ([string]::IsNullOrWhiteSpace($ManifestPath)) { Fail "WorkUnit mode requires -ManifestPath" }
  if ([string]::IsNullOrWhiteSpace($WorktreePath)) { Fail "WorkUnit mode requires -WorktreePath" }
  $resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath).Path
  $manifestRootPrefix = $WorkUnitsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $resolvedManifest.StartsWith($manifestRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Fail "ManifestPath must be inside canonical $WorkUnitsRoot"
  }
  $record = @($RepositoryState.Records | Where-Object { $_.File -eq $resolvedManifest })
  if ($record.Count -ne 1 -or -not $record[0].Active) { Fail "ManifestPath does not identify one active registered Work Unit" }
  $record = $record[0]
  $manifest = $record.Manifest
  Assert-ExecutionEnabled $RepositoryState.TrainRegistry
  $manifestRelative=$resolvedManifest.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
  foreach($controlRef in @($manifestRelative,"governance/execution/train-registry.json","governance/execution/leases.json","governance/execution/integration-queue.json","governance/execution/templates/docker-compose.worktree.yml")){$null=Assert-CanonicalTrackedPath $controlRef "WorkUnit immutable control input"}
  $train = $RepositoryState.TrainSet[$record.TrainId.ToLowerInvariant()]
  if ($null -eq $train) { Fail "Work Unit references an unregistered Train" }
  $trainStatus = (Require-Text $train "status" "Release Train $($record.TrainId)").ToUpperInvariant()
  $humanApprovalStatus = (Require-Text $train "humanApprovalStatus" "Release Train $($record.TrainId)").ToUpperInvariant()
  $trainBusinessWrite = (Get-OptionalValue $train "businessWriteAuthorized") -eq $true

  if ($record.ExecutionMode -eq "BUSINESS_CONSTRUCTION") {
    if ($trainStatus -notin @("CHARTER_HUMAN_APPROVED","ASSEMBLING") -or
        $humanApprovalStatus -notin @("APPROVED", "HUMAN_APPROVED", "EXPLICIT_HUMAN_APPROVAL_RECORDED") -or
        -not $trainBusinessWrite -or -not $record.BusinessWriteAuthorized -or
        $record.Status -notin @("CONSTRUCTION_AUTHORIZED", "IN_CONSTRUCTION")) {
      Fail "BUSINESS_CONSTRUCTION is not authorized: Train must be CHARTER_HUMAN_APPROVED with explicit Human approval and business authority; Work Unit must be CONSTRUCTION_AUTHORIZED or IN_CONSTRUCTION with businessWriteAuthorized=true"
    }
  } elseif ($record.ExecutionMode -eq "VALIDATION_ONLY") {
    if ($record.BusinessWriteAuthorized -or $trainBusinessWrite) { Fail "VALIDATION_ONLY may not carry business write authority" }
    if ($trainStatus -ne "VALIDATION_AUTHORIZED" -or $humanApprovalStatus -ne "EXPLICIT_HUMAN_APPROVAL_RECORDED" -or (Get-OptionalValue $train "runtimeCanaryAuthorized") -ne $true) { Fail "VALIDATION_ONLY WorkUnit requires the independently approved VALIDATION_AUTHORIZED Train state" }
  } else {
    Fail "unsupported Work Unit executionMode: $($record.ExecutionMode)"
  }

  $resolvedWorktree = (Resolve-Path -LiteralPath $WorktreePath).Path
  $declaredWorktree = Require-Text $manifest "worktreePath" "Work Unit $($record.WorkUnitId)"
  if (-not $resolvedWorktree.Equals($declaredWorktree, [StringComparison]::OrdinalIgnoreCase)) {
    Fail "worktree path mismatch: manifest=$declaredWorktree actual=$resolvedWorktree"
  }
  $expectedWorktree = "G:\xlb100-worktrees\$($record.TrainId)\$($record.WorkUnitId)"
  if (-not $resolvedWorktree.Equals($expectedWorktree, [StringComparison]::OrdinalIgnoreCase)) {
    Fail "worktree is outside the approved managed pool or identity path: expected $expectedWorktree"
  }

  $topLevel = (Invoke-Git $resolvedWorktree @("rev-parse", "--show-toplevel") | Select-Object -First 1)
  if (-not ([IO.Path]::GetFullPath($topLevel)).Equals([IO.Path]::GetFullPath($resolvedWorktree), [StringComparison]::OrdinalIgnoreCase)) {
    Fail "WorktreePath is not the Git top-level directory"
  }
  $canonicalCommon = (Invoke-Git $Root @("rev-parse", "--git-common-dir") | Select-Object -First 1)
  if (-not [IO.Path]::IsPathRooted($canonicalCommon)) { $canonicalCommon = Join-Path $Root $canonicalCommon }
  $worktreeCommon = (Invoke-Git $resolvedWorktree @("rev-parse", "--git-common-dir") | Select-Object -First 1)
  if (-not [IO.Path]::IsPathRooted($worktreeCommon)) { $worktreeCommon = Join-Path $resolvedWorktree $worktreeCommon }
  if (-not ([IO.Path]::GetFullPath($canonicalCommon)).Equals([IO.Path]::GetFullPath($worktreeCommon), [StringComparison]::OrdinalIgnoreCase)) {
    Fail "managed worktree is not attached to the canonical repository"
  }
  $envFileName = Require-Text $record.Environment "envFileName" "Work Unit environment"
  if ($envFileName -ne ".env.worktree.local") { Fail "Work Unit envFileName must be .env.worktree.local" }
  & git -C $resolvedWorktree check-ignore -q -- $envFileName
  if ($LASTEXITCODE -ne 0) { Fail "$envFileName must be excluded by git check-ignore" }

  $branch = (Invoke-Git $resolvedWorktree @("branch", "--show-current") | Select-Object -First 1).Trim()
  $declaredBranch = Require-Text $manifest "branch" "Work Unit $($record.WorkUnitId)"
  if ($branch -ne $declaredBranch) { Fail "branch mismatch: manifest=$declaredBranch actual=$branch" }
  $baseCommit = Require-Text $manifest "baseCommit" "Work Unit $($record.WorkUnitId)"
  $trainBaseCommit = Require-Text $train "baseCommit" "Release Train $($record.TrainId)"
  if ($baseCommit -ne $trainBaseCommit) { Fail "Work Unit baseCommit does not match its Release Train baseCommit" }
  if ($baseCommit -notmatch '^[0-9a-fA-F]{40}$') { Fail "baseCommit must be a full 40-character commit hash" }
  $baseType = (Invoke-Git $resolvedWorktree @("cat-file", "-t", $baseCommit) | Select-Object -First 1).Trim()
  if ($baseType -ne "commit") { Fail "baseCommit does not identify a Git commit object: $baseCommit ($baseType)" }
  $base = (Invoke-Git $resolvedWorktree @("rev-parse", "$baseCommit^{commit}") | Select-Object -First 1).Trim()
  $baseTagMember = $manifest.PSObject.Properties["baseTag"]
  if ($null -ne $baseTagMember -and $null -ne $baseTagMember.Value -and -not [string]::IsNullOrWhiteSpace("$($baseTagMember.Value)")) {
    $baseTag = "$($baseTagMember.Value)".Trim()
    $tagCommit = (Invoke-Git $resolvedWorktree @("rev-parse", "$baseTag^{}") | Select-Object -First 1).Trim()
    if ($tagCommit -ne $base) { Fail "baseTag $baseTag peels to $tagCommit, not baseCommit $base" }
  }
  $trainBaseTag = Get-OptionalValue $train "baseTag"
  if ($null -ne $trainBaseTag -and -not [string]::IsNullOrWhiteSpace("$trainBaseTag")) {
    $trainTagCommit = (Invoke-Git $resolvedWorktree @("rev-parse", "$trainBaseTag^{}") | Select-Object -First 1).Trim()
    if ($trainTagCommit -ne $base) { Fail "Train baseTag $trainBaseTag peels to $trainTagCommit, not baseCommit $base" }
  }
  $target = (Invoke-Git $resolvedWorktree @("rev-parse", "$TargetRef^{commit}") | Select-Object -First 1).Trim()
  & git -C $resolvedWorktree merge-base --is-ancestor $base $target *> $null
  if ($LASTEXITCODE -ne 0) { Fail "TargetRef $target is not descended from fixed base $base" }

  $changed = @()
  $changed += Invoke-Git $resolvedWorktree @("diff", "--no-renames", "--name-only", "--diff-filter=ACDMRTUXB", $base, $target, "--")
  if ($TargetRef -eq "HEAD") {
    $changed += Invoke-Git $resolvedWorktree @("diff", "--no-renames", "--name-only", "--diff-filter=ACDMRTUXB", "--")
    $changed += Invoke-Git $resolvedWorktree @("diff", "--cached", "--no-renames", "--name-only", "--diff-filter=ACDMRTUXB", "--")
    $changed += Invoke-Git $resolvedWorktree @("ls-files", "--others", "--exclude-standard")
  }
  $changed = @($changed | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") } | ForEach-Object {
    Normalize-RepoPath "$_" "actual changed paths"
  } | Sort-Object -Unique)

  if ($record.Status -in @("PACKAGE_VERIFIED", "PACKAGE_AUDITED", "QUEUED", "INTEGRATED")) {
    $candidateCommit = Require-Text $manifest "candidateCommit" "Work Unit $($record.WorkUnitId) in $($record.Status)"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$') { Fail "candidateCommit must be a full 40-character commit hash" }
    $candidateType = (Invoke-Git $resolvedWorktree @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim()
    if ($candidateType -ne "commit" -or $candidateCommit -ne $target) {
      Fail "package/queue states accept only the immutable candidate commit; manifest=$candidateCommit target=$target type=$candidateType"
    }
    $dirty = @(Invoke-Git $resolvedWorktree @("status", "--porcelain=v1", "--untracked-files=all"))
    if (@($dirty | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }).Count -gt 0) {
      Fail "package/queue states require a clean worktree at the immutable candidate commit"
    }
  }

  foreach ($path in $changed) {
    if ($record.ForbiddenPaths -contains "**" -or @($record.ForbiddenPaths | Where-Object { $_ -ne "**" -and (Test-PrefixMatch $path $_) }).Count -gt 0) {
      Fail "changed path hits forbiddenPaths: $path"
    }
    if (@($record.AllowedPaths | Where-Object { Test-PrefixMatch $path $_ }).Count -eq 0) {
      Fail "changed path is outside allowedPaths lease: $path"
    }
  }

  $migrationChanges = @($changed | Where-Object { $_ -like "db/migrations/*" })
  foreach ($path in $migrationChanges) {
    & git -C $resolvedWorktree cat-file -e "$base`:$path" 2>$null
    if ($LASTEXITCODE -eq 0) { Fail "Work Unit may not modify/delete a migration present at fixed base: $path" }
  }
  $reservationMember = $manifest.PSObject.Properties["migrationReservation"]
  $reservation = if ($null -eq $reservationMember) { $null } else { $reservationMember.Value }
  if ($migrationChanges.Count -gt 0) {
    if ($null -eq $reservation -or "$reservation" -eq "NONE") { Fail "migration changed without manifest reservation" }
    $number = Require-Text $reservation "number" "manifest migrationReservation"
    $filename = Require-Text $reservation "expectedFilename" "manifest migrationReservation"
    if ($migrationChanges.Count -ne 1 -or $migrationChanges[0] -ne "db/migrations/$filename") {
      Fail "migration diff must contain only reserved file db/migrations/$filename; found $($migrationChanges -join ', ')"
    }
    if ($filename -notmatch "^$([regex]::Escape($number))[_-].*\.sql$") { Fail "reserved migration number and filename do not agree: $number / $filename" }
    $ledgerMatch = @($RepositoryState.Reservations | Where-Object {
      "$($_.trainId)" -eq $record.TrainId -and "$($_.workUnitId)" -eq $record.WorkUnitId -and
      "$($_.number)" -eq $number -and "$($_.expectedFilename)" -eq $filename -and
      "$($_.status)".ToUpperInvariant() -notin $InactiveReservationStatuses
    })
    if ($ledgerMatch.Count -ne 1) { Fail "manifest migrationReservation has no unique active Ledger match" }
  }

  if ($record.ExecutionMode -eq "VALIDATION_ONLY") {
    Write-Output "VALIDATION_ENVIRONMENT_ELIGIBLE train=$($record.TrainId) workUnit=$($record.WorkUnitId) target=$target changedPaths=$($changed.Count)"
  } elseif ($record.IsSerialCanonicalWriter) {
    Assert-SerialCanonicalWriterBinding $record $RepositoryState.ActiveLeases
    Write-Output "WORK_UNIT_SERIAL_CANONICAL_WRITER_ELIGIBLE train=$($record.TrainId) workUnit=$($record.WorkUnitId) writer=$($record.CanonicalWriterKey) target=$target changedPaths=$($changed.Count)"
  } else {
    Write-Output "WORK_UNIT_PARALLEL_ELIGIBLE train=$($record.TrainId) workUnit=$($record.WorkUnitId) target=$target changedPaths=$($changed.Count)"
  }
}

function Invoke-NegativeSelfTests {
  $passed = 0
  function Assert-Rejected([string]$Name, [scriptblock]$Action) {
    $rejected = $false
    try { & $Action 2>$null | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "[managed-worktree] SELF-TEST FAIL expected rejection: $Name" }
    Write-Host "self-test rejected: $Name"
    $script:SelfTestPassed++
  }
  $script:SelfTestPassed = 0
  Assert-Rejected "invalid schemaVersion" { Require-SchemaVersion ([pscustomobject]@{schemaVersion=99}) 1 "fixture" }
  Assert-Rejected "invalid Work Unit status" { if ("UNKNOWN" -notin $AllowedWorkUnitStatuses) { Fail "invalid fixture status" } }
  Assert-Rejected "port 0" { Require-Port ([pscustomobject]@{port=0}) "port" "fixture" }
  Assert-Rejected "port 65536" { Require-Port ([pscustomobject]@{port=65536}) "port" "fixture" }
  Assert-Rejected "missing environment field" { $null = Require-Text ([pscustomobject]@{}) "mysqlDatabase" "fixture" }
  Assert-Rejected "duplicate leased port" {
    Assert-UniqueValues @([pscustomobject]@{port="13306"},[pscustomobject]@{port="13306"}) "port" "fixture"
  }
  Assert-Rejected "missing CANONICAL_WRITER protectedPaths" {
    $fixture = [pscustomobject]@{key="writer"}
    if ($null -eq (Get-OptionalValue $fixture "protectedPaths")) { Fail "missing protectedPaths" }
  }
  Assert-Rejected "duplicate branch" {
    Assert-UniqueValues @([pscustomobject]@{branch="codex/a"},[pscustomobject]@{branch="codex/a"}) "branch" "fixture"
  }
  Assert-Rejected "duplicate worktreePath" {
    Assert-UniqueValues @([pscustomobject]@{path="G:/pool/a"},[pscustomobject]@{path="G:/pool/a"}) "path" "fixture"
  }
  Assert-Rejected "duplicate reservation including ABANDONED" {
    Assert-UniqueValues @(
      [pscustomobject]@{number="058";status="ABANDONED"},
      [pscustomobject]@{number="058";status="RESERVED"}
    ) "number" "fixture"
  }
  Assert-Rejected "rename-unsafe diff arguments" {
    $fixtureArgs = @("diff", "--name-only")
    if ($fixtureArgs -notcontains "--no-renames") { Fail "rename source would be omitted" }
  }
  Assert-Rejected "global NOT_ENABLED eligibility" {
    Assert-ExecutionEnabled ([pscustomobject]@{executionSystemStatus="BOOTSTRAP";enablementStatus="NOT_ENABLED"})
  }
  Assert-Rejected "queue item while acceptingItems=false" {
    Assert-QueueOpenState $false @([pscustomobject]@{sequence=1})
  }
  Assert-Rejected "Validation Train cannot enter business acceptance lifecycle" {
    Assert-HistoryLegalStatusEdge "RELEASE_TRAIN" "TRAIN_VERIFIED" "HUMAN_ACCEPTED" "validation graph fixture" "VALIDATION_ONLY"
  }
  Assert-Rejected "Validation Train cannot reset through BLOCKED" {
    Assert-HistoryLegalStatusEdge "RELEASE_TRAIN" "TRAIN_VERIFIED" "BLOCKED" "validation graph fixture" "VALIDATION_ONLY"
  }
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
  $fixtureRoot = Join-Path $tempRoot ("xlb-managed-gate-fixture-" + [Guid]::NewGuid().ToString("N"))
  $null = New-Item -ItemType Directory -Path $fixtureRoot
  $null = New-Item -ItemType Directory -Path (Join-Path $fixtureRoot "status-merge-introduction-repo") -Force
  $fixtureFiles = @()
  $fixtureDirs = @()
  try {
    $duplicatePath = Join-Path $fixtureRoot "duplicate.json"; $fixtureFiles += $duplicatePath
    [IO.File]::WriteAllText($duplicatePath, '{"schemaVersion":1,"schemaVersion":2}', [Text.Encoding]::UTF8)
    Assert-Rejected "production Read-Json duplicate key" { $null = Read-Json $duplicatePath "duplicate-key fixture" }
    Assert-Rejected "production strict authority record missing recordId" {
      Assert-StrictRecordIdentity ([pscustomobject]@{createdAt="2026-07-14T00:00:00+08:00"}) "authority identity fixture"
    }
    Assert-Rejected "production strict authority record invalid createdAt" {
      Assert-StrictRecordIdentity ([pscustomobject]@{recordId="AUTHORITY-FIXTURE";createdAt="2026-07-14 00:00:00"}) "authority timestamp fixture"
    }

    $globalPath = Join-Path $fixtureRoot "enabled-pending.json"; $fixtureFiles += $globalPath
    $globalFixture = [ordered]@{
      schemaVersion=1;updatedAt="2026-07-14T00:00:00+08:00";executionSystemStatus="ENABLED";enablementStatus="ENABLED"
      previousExecutionSystemStatus="BOOTSTRAP";previousEnablementStatus="NOT_ENABLED";statusChangedAt="2026-07-14T00:00:00+08:00"
      transitionAuthorityRef="governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md";enablementConditions=@()
      enablementApprovalRef="PENDING";auditedCandidateCommit="PENDING";independentAuditRef="PENDING";humanConfirmationRef="PENDING"
      canonicalRoot="G:\xlb100";managedWorktreePool="G:\xlb100-worktrees";maxConcurrentWriteWorkUnits=3;trains=@()
    }
    [IO.File]::WriteAllText($globalPath, ($globalFixture|ConvertTo-Json -Depth 10), [Text.Encoding]::UTF8)
    Assert-Rejected "production global enablement with PENDING authority" { $fixture=Read-Json $globalPath "global enablement fixture";Assert-StrictTrainRegistry $fixture;Assert-EnablementAuthorityChain $fixture "ENABLED" "ENABLED" @() }

    $queuePath = Join-Path $fixtureRoot "queue-fake-booleans.json"; $fixtureFiles += $queuePath
    $queueFixture = [ordered]@{
      schemaVersion=1;updatedAt="2026-07-14T00:00:00+08:00";executionSystemStatus="ENABLED";enablementStatus="ENABLED";previousEnablementStatus="NOT_ENABLED"
      statusChangedAt="2026-07-14T00:00:00+08:00";transitionAuthorityRef="governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md"
      acceptingItems=$true;mode="MANUAL_AUDITABLE_SERIAL_QUEUE";ownerRole="Integration Owner";nextSequence=2;rules=[ordered]@{}
      items=@([ordered]@{sequence=1;trainId="RT";workUnitId="WU";status="QUEUED";candidateCommit=('0'*40);candidateDigest=('0'*64);cleanWorktree=$true;immutableCandidateCommit=$true;stale=$false;independentAuditStatus="PASS"})
    }
    [IO.File]::WriteAllText($queuePath, ($queueFixture|ConvertTo-Json -Depth 10), [Text.Encoding]::UTF8)
    Assert-Rejected "production queue self-reported booleans" { $fixture=Read-Json $queuePath "queue fixture";Assert-StrictQueue $fixture }

    $head = (Invoke-Git $Root @("rev-parse","HEAD^{commit}")|Select-Object -First 1).Trim()
    $digestPath=Join-Path $fixtureRoot "queue-digest.json";$fixtureFiles+=$digestPath
    [IO.File]::WriteAllText($digestPath,(@{candidateCommit=$head;candidateDigest=('0'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1"}|ConvertTo-Json),[Text.Encoding]::UTF8)
    Assert-Rejected "production candidate digest mismatch" { $digestFixture=Read-Json $digestPath "candidate digest fixture";$null=Assert-CandidateDigestBinding $digestFixture.candidateCommit $digestFixture.candidateDigest $digestFixture.candidateDigestAlgorithm "fixture" }

    $serialPath=Join-Path $fixtureRoot "serial-overlap.json";$fixtureFiles+=$serialPath
    $canonicalLeaseLedger=Read-Json $LeasesPath "canonical lease fixture source"
    $serialFixture=[ordered]@{
      activeLeases=@($canonicalLeaseLedger.leases|Where-Object{$_.type-eq"CANONICAL_WRITER"-and$_.status-eq"ACTIVE"})
      activeWrites=@(@{AllowedPaths=@("backend/src/order/extensions")},@{AllowedPaths=@("backend/src")})
    }
    [IO.File]::WriteAllText($serialPath,($serialFixture|ConvertTo-Json -Depth 8),[Text.Encoding]::UTF8)
    Assert-Rejected "production serial protected descendant overlap" { $serial=Read-Json $serialPath "serial overlap fixture";Assert-CanonicalWriterProtection @($serial.activeWrites[0]) @($serial.activeLeases) $false }
    Assert-Rejected "production serial protected ancestor overlap" { $serial=Read-Json $serialPath "serial overlap fixture";Assert-CanonicalWriterProtection @($serial.activeWrites[1]) @($serial.activeLeases) $false }
    Assert-Rejected "production canonical writer self-reported ownership mismatch" {
      $serial=Read-Json $serialPath "serial ownership fixture"
      $shared=@($serial.activeLeases|Where-Object key -eq "shared-contract-types-validators-api-events")[0]
      $runtime=@($serial.activeLeases|Where-Object key -eq "canonical-shared-runtime")[0]
      $shared.protectedPaths=@($shared.protectedPaths|Where-Object{$_-ne"packages/types"})+@("backend/src/order")
      $runtime.protectedPaths=@($runtime.protectedPaths|Where-Object{$_-ne"backend/src/order"})+@("packages/types")
      Assert-CanonicalWriterProtection @() @($serial.activeLeases) $false
    }
    Assert-Rejected "production mandatory canonical writer coverage" {
      $serial=Read-Json $serialPath "serial mandatory fixture"
      $governance=@($serial.activeLeases|Where-Object key -eq "current-state-phase-registry-lock-report-tag")[0]
      $governance.protectedPaths=@($governance.protectedPaths|Where-Object{$_-ne".cursor/skills"})
      Assert-CanonicalWriterProtection @() @($serial.activeLeases)
    }
    Assert-Rejected "serial canonical writer partial declaration" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="BUSINESS_CONSTRUCTION";leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-INTEGRATION-QUEUE"}}) "serial declaration fixture"
    }
    Assert-Rejected "ordinary Work Unit smuggles canonical writer binding" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role="TEST_OWNER";executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey="integration-queue-and-integration-branch";leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-INTEGRATION-QUEUE"}}) "serial declaration fixture"
    }
    Assert-Rejected "validation Work Unit declares serial canonical writer" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="VALIDATION_ONLY";canonicalWriterKey="integration-queue-and-integration-branch";leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-INTEGRATION-QUEUE"}}) "serial declaration fixture"
    }
    Assert-Rejected "unsupported serial canonical writer key" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey="current-state-phase-registry-lock-report-tag";leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-GOVERNANCE-METADATA"}}) "serial declaration fixture"
    }
    Assert-Rejected "ordinary Work Unit cannot carry blank serial canonical writer markers" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role="TEST_OWNER";executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey="";leaseRefs=[pscustomobject]@{canonicalWriter=""}}) "serial declaration fixture"
    }
    Assert-Rejected "serial canonical writer key cannot be null" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey=$null;leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-INTEGRATION-QUEUE"}}) "serial declaration fixture"
    }
    Assert-Rejected "serial canonical writer key must be a JSON string" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey=42;leaseRefs=[pscustomobject]@{canonicalWriter="LEASE-SERIAL-INTEGRATION-QUEUE"}}) "serial declaration fixture"
    }
    Assert-Rejected "serial canonical writer lease ref must be a JSON string" {
      $null=Get-SerialCanonicalWriterDeclaration ([pscustomobject]@{role=$SerialCanonicalWriterRole;executionMode="BUSINESS_CONSTRUCTION";canonicalWriterKey="integration-queue-and-integration-branch";leaseRefs=[pscustomobject]@{canonicalWriter=42}}) "serial declaration fixture"
    }
    $integrationLeaseSource=@($canonicalLeaseLedger.leases|Where-Object{$_.leaseId-eq"LEASE-SERIAL-INTEGRATION-QUEUE"})[0]
    $integrationLease=[pscustomobject]@{Id=$integrationLeaseSource.leaseId;Type="CANONICAL_WRITER";Key=$integrationLeaseSource.key;TrainId=$integrationLeaseSource.trainId;WorkUnitId=$integrationLeaseSource.workUnitId;ProtectedPaths=@($integrationLeaseSource.protectedPaths)}
    $serialRecord=[pscustomobject]@{IsSerialCanonicalWriter=$true;ExecutionMode="BUSINESS_CONSTRUCTION";CanonicalWriterLeaseId=$integrationLease.Id;CanonicalWriterKey=$integrationLease.Key;AllowedPaths=@("scripts/check-phase29-entry-boundaries.ps1");Manifest=[pscustomobject]@{owner="INTEGRATION-OWNER";role=$SerialCanonicalWriterRole}}
    Assert-SerialCanonicalWriterBinding $serialRecord @($integrationLease)
    Write-Host "self-test accepted: serial canonical writer exact binding"
    Assert-Rejected "serial canonical writer owner mismatch" {
      $bad=$serialRecord.PSObject.Copy();$bad.Manifest=[pscustomobject]@{owner="Construction Owner";role=$SerialCanonicalWriterRole};Assert-SerialCanonicalWriterBinding $bad @($integrationLease)
    }
    Assert-Rejected "serial canonical writer missing active writer lease" {
      Assert-SerialCanonicalWriterBinding $serialRecord @()
    }
    Assert-Rejected "serial canonical writer path belongs to another writer" {
      $bad=$serialRecord.PSObject.Copy();$bad.AllowedPaths=@("backend/src/order");$runtimeSource=@($canonicalLeaseLedger.leases|Where-Object{$_.leaseId-eq"LEASE-SERIAL-CANONICAL-RUNTIME"})[0];$runtime=[pscustomobject]@{Id=$runtimeSource.leaseId;Type="CANONICAL_WRITER";Key=$runtimeSource.key;TrainId=$runtimeSource.trainId;WorkUnitId=$runtimeSource.workUnitId;ProtectedPaths=@($runtimeSource.protectedPaths)};Assert-SerialCanonicalWriterBinding $bad @($integrationLease,$runtime)
    }
    Assert-Rejected "serial canonical writer governance self-modification" {
      $bad=$serialRecord.PSObject.Copy();$bad.AllowedPaths=@("governance/execution/integration-queue.json");Assert-SerialCanonicalWriterBinding $bad @($integrationLease)
    }
    Assert-Rejected "serial canonical writer complete surface reservation" {
      $bad=$serialRecord.PSObject.Copy();$bad.AllowedPaths=@($integrationLease.ProtectedPaths);Assert-SerialCanonicalWriterBinding $bad @($integrationLease)
    }
    Assert-Rejected "duplicate non-terminal serial canonical writer reservations" {
      $one=[pscustomobject]@{Active=$true;IsSerialCanonicalWriter=$true;CanonicalWriterKey=$integrationLease.Key;WorkUnitId="WU-ONE"};$two=[pscustomobject]@{Active=$true;IsSerialCanonicalWriter=$true;CanonicalWriterKey=$integrationLease.Key;WorkUnitId="WU-TWO"};Assert-UniqueSerialCanonicalWriterReservations @($one,$two)
    }

    $currentContractPaths=@("docs/contracts")
    $currentContractAuthority=[pscustomobject]@{Revision=$head;Digest=(Get-ProtectedPathsDigest $head $currentContractPaths);Paths=$currentContractPaths}
    $noneContractRecord=[pscustomobject]@{WorkUnitId="WU-CONTRACT-NONE";Manifest=[pscustomobject]@{contractRevision="NONE"}}
    Assert-Rejected "production construction entry contractRevision NONE" { Assert-WorkUnitContractAuthority $noneContractRecord $currentContractAuthority }
    $draftTrain=[pscustomobject]@{trainId="RT-DRAFT";status="DRAFT";approvalRef="PENDING";businessWriteAuthorized=$false}
    $queuedRecord=[pscustomobject]@{WorkUnitId="WU-QUEUED";ExecutionMode="BUSINESS_CONSTRUCTION";Status="QUEUED";BusinessWriteAuthorized=$false}
    Assert-Rejected "production DRAFT Train cannot carry QUEUED Work Unit" { Assert-TrainWorkUnitAuthority $queuedRecord $draftTrain "ENABLED" "ENABLED" }
    $flagTrain=[pscustomobject]@{trainId="RT-FLAG";mainMergeAuthorized=$true;lockAuthorized=$false;productionAuthorized=$false}
    Assert-Rejected "production reserved Train authority flag true" { Assert-ReservedTrainAuthorityFlags $flagTrain }

    $contractRepo=Join-Path $fixtureRoot "contract-repo";$fixtureDirs+=$contractRepo;$contractDir=Join-Path $contractRepo "docs/contracts";$null=New-Item -ItemType Directory -Path $contractDir -Force
    $null=& git -C $contractRepo init;$null=& git -C $contractRepo config user.email "fixture@xlb.invalid";$null=& git -C $contractRepo config user.name "XLB Fixture"
    $contractFile=Join-Path $contractDir "CONTRACT_FIXTURE.md";[IO.File]::WriteAllText($contractFile,"revision one",[Text.Encoding]::UTF8)
    $null=& git -C $contractRepo add docs/contracts/CONTRACT_FIXTURE.md;$null=& git -C $contractRepo commit -m "fixture frozen contract";if($LASTEXITCODE-ne0){throw"fixture contract baseline commit failed"}
    $contractBase=(& git -C $contractRepo rev-parse HEAD).Trim();$contractPaths=@("docs/contracts")
    $contractDigest=Invoke-WithRepositoryRoot $contractRepo { Get-ProtectedPathsDigest $contractBase $contractPaths }
    [IO.File]::WriteAllText($contractFile,"revision two after freeze",[Text.Encoding]::UTF8);$null=& git -C $contractRepo add docs/contracts/CONTRACT_FIXTURE.md;$null=& git -C $contractRepo commit -m "fixture changed contract";if($LASTEXITCODE-ne0){throw"fixture contract change commit failed"}
    $contractCandidate=(& git -C $contractRepo rev-parse HEAD).Trim()
    $staleContractAuthority=[pscustomobject]@{Revision=$contractBase;Digest=$contractDigest;Paths=$contractPaths}
    $staleContractRecord=[pscustomobject]@{WorkUnitId="WU-CONTRACT-STALE";Manifest=[pscustomobject]@{contractRevision=$contractBase}}
    Assert-Rejected "production candidate changed contract after frozen revision" { Invoke-WithRepositoryRoot $contractRepo { Assert-WorkUnitContractAuthority $staleContractRecord $staleContractAuthority $contractCandidate } }
    Assert-Rejected "production current integration contract authority stale" { Invoke-WithRepositoryRoot $contractRepo { Assert-ContractDigestCurrent $contractBase $contractDigest $contractPaths "fixture Train contract authority" } }
    $inertStaleAuthority=[pscustomobject]@{Revision=$contractBase;Digest=$contractDigest;Paths=$contractPaths;IsCurrent=$false}
    $inertStaleRecord=[pscustomobject]@{WorkUnitId="WU-CONTRACT-INERT-STALE";Status="STALE";BusinessWriteAuthorized=$false;Manifest=[pscustomobject]@{contractRevision=$contractBase}}
    Invoke-WithRepositoryRoot $contractRepo { Assert-WorkUnitContractAuthority $inertStaleRecord $inertStaleAuthority }
    $mismatchedStaleRecord=[pscustomobject]@{WorkUnitId="WU-CONTRACT-MISMATCH-STALE";Status="STALE";BusinessWriteAuthorized=$false;Manifest=[pscustomobject]@{contractRevision=$contractCandidate}}
    Assert-Rejected "production STALE Work Unit contractRevision differs from retained authority" { Invoke-WithRepositoryRoot $contractRepo { Assert-WorkUnitContractAuthority $mismatchedStaleRecord $inertStaleAuthority } }
    $activeWithStaleContract=[pscustomobject]@{WorkUnitId="WU-CONTRACT-ACTIVE-STALE";Status="PACKAGE_AUDITED";BusinessWriteAuthorized=$false;Manifest=[pscustomobject]@{contractRevision=$contractBase}}
    Assert-Rejected "production active Work Unit with stale contract authority" { Invoke-WithRepositoryRoot $contractRepo { Assert-WorkUnitContractAuthority $activeWithStaleContract $inertStaleAuthority } }

    $migrationRepo=Join-Path $fixtureRoot "migration-repo";$fixtureDirs+=$migrationRepo;$migrationDir=Join-Path $migrationRepo "db/migrations";$null=New-Item -ItemType Directory -Path $migrationDir -Force
    $null=& git -C $migrationRepo init; if($LASTEXITCODE-ne0){throw"fixture git init failed"}
    $null=& git -C $migrationRepo config user.email "fixture@xlb.invalid";$null=& git -C $migrationRepo config user.name "XLB Fixture"
    $base057=Join-Path $migrationDir "057_phase29.sql";[IO.File]::WriteAllText($base057,"-- locked baseline",[Text.Encoding]::UTF8)
    $null=& git -C $migrationRepo add db/migrations/057_phase29.sql;$null=& git -C $migrationRepo commit -m "fixture baseline";if($LASTEXITCODE-ne0){throw"fixture baseline commit failed"}
    $migrationBaseline=(&git -C $migrationRepo rev-parse HEAD).Trim()
    $nestedMigrationDir=Join-Path $migrationDir "nested";$null=New-Item -ItemType Directory -Path $nestedMigrationDir
    $nestedMigration=Join-Path $nestedMigrationDir "058_nested.sql";[IO.File]::WriteAllText($nestedMigration,"-- nested fixture",[Text.Encoding]::UTF8)
    $null=&git -C $migrationRepo add db/migrations/nested/058_nested.sql;$null=&git -C $migrationRepo commit -m "fixture committed nested migration"
    Assert-Rejected "production committed nested migration file" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture migration baseline restore failed"}
    $nonSqlMigration=Join-Path $migrationDir "058_not_sql.txt";[IO.File]::WriteAllText($nonSqlMigration,"non-SQL fixture",[Text.Encoding]::UTF8)
    $null=&git -C $migrationRepo add db/migrations/058_not_sql.txt;$null=&git -C $migrationRepo commit -m "fixture committed non-SQL migration"
    Assert-Rejected "production committed non-SQL migration file" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture migration baseline restore failed"}
    $shadow024=Join-Path $migrationDir "024_shadow.sql";[IO.File]::WriteAllText($shadow024,"-- untracked fixture",[Text.Encoding]::UTF8)
    Assert-Rejected "production untracked locked migration" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    Remove-Item -LiteralPath $shadow024 -Force
    $duplicate057=Join-Path $migrationDir "057_duplicate.sql";[IO.File]::WriteAllText($duplicate057,"-- duplicate fixture",[Text.Encoding]::UTF8)
    Assert-Rejected "production filesystem duplicate locked migration" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    Remove-Item -LiteralPath $duplicate057 -Force
    [IO.File]::WriteAllText($base057,"-- unstaged mutation",[Text.Encoding]::UTF8)
    Assert-Rejected "production unstaged locked migration" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    $null=& git -C $migrationRepo checkout -- db/migrations/057_phase29.sql;if($LASTEXITCODE-ne0){throw"fixture restore failed"}
    [IO.File]::WriteAllText($base057,"-- staged mutation",[Text.Encoding]::UTF8);$null=& git -C $migrationRepo add db/migrations/057_phase29.sql
    Assert-Rejected "production staged locked migration" { $null=Get-MigrationRepositoryIndex $migrationRepo }
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture locked DAG baseline restore failed"};[IO.File]::WriteAllText($base057,"-- history mutation",[Text.Encoding]::UTF8);$null=&git -C $migrationRepo add db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked migration history mutation";$null=&git -C $migrationRepo checkout $migrationBaseline -- db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked migration history restore";Assert-Rejected "production locked migration rewrite then restore" {Invoke-WithRepositoryRoot $migrationRepo {Assert-LockedMigrationDag $migrationBaseline}}
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture locked DAG delete baseline restore failed"};Remove-Item -LiteralPath $base057 -Force;$null=&git -C $migrationRepo add -u -- db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked migration delete";[IO.File]::WriteAllText($base057,"-- locked baseline",[Text.Encoding]::UTF8);$null=&git -C $migrationRepo add db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked migration readd";Assert-Rejected "production locked migration delete and re-add" {Invoke-WithRepositoryRoot $migrationRepo {Assert-LockedMigrationDag $migrationBaseline}}
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture locked DAG sibling baseline restore failed"};[IO.File]::WriteAllText($base057,"-- sibling mutation",[Text.Encoding]::UTF8);$null=&git -C $migrationRepo add db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked sibling mutation";$lockedSiblingTamper=(&git -C $migrationRepo rev-parse HEAD).Trim();$null=&git -C $migrationRepo checkout --detach $migrationBaseline;[IO.File]::WriteAllText((Join-Path $migrationRepo "locked-sibling.txt"),"canonical sibling",[Text.Encoding]::UTF8);$null=&git -C $migrationRepo add locked-sibling.txt;$null=&git -C $migrationRepo commit -m "fixture locked canonical sibling";$null=&git -C $migrationRepo merge --no-ff --no-commit $lockedSiblingTamper;if($LASTEXITCODE-ne0){throw"fixture locked sibling merge preparation failed"};$null=&git -C $migrationRepo checkout $migrationBaseline -- db/migrations/057_phase29.sql;$null=&git -C $migrationRepo commit -m "fixture locked merge resolution restore";Assert-Rejected "production locked migration sibling rewrite hidden by merge resolution" {Invoke-WithRepositoryRoot $migrationRepo {Assert-LockedMigrationDag $migrationBaseline}}
    $null=&git -C $migrationRepo checkout --detach $migrationBaseline;if($LASTEXITCODE-ne0){throw"fixture locked alternate baseline restore failed"};$lockedAlternate=Join-Path $migrationDir "nested/057_shadow.txt";$null=New-Item -ItemType Directory -Path (Split-Path $lockedAlternate) -Force;[IO.File]::WriteAllText($lockedAlternate,"alternate locked path",[Text.Encoding]::UTF8);$null=&git -C $migrationRepo add db/migrations/nested/057_shadow.txt;$null=&git -C $migrationRepo commit -m "fixture locked nested alternate path";Assert-Rejected "production locked nested non-SQL alternate path" {Invoke-WithRepositoryRoot $migrationRepo {Assert-LockedMigrationDag $migrationBaseline}}

    $reservationRepo=Join-Path $fixtureRoot "reservation-history-repo";$fixtureDirs+=$reservationRepo
    $reservationLedgerDir=Join-Path $reservationRepo "governance/execution";$reservationMigrationDir=Join-Path $reservationRepo "db/migrations"
    $null=New-Item -ItemType Directory -Path $reservationLedgerDir -Force;$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    $null=&git -C $reservationRepo init;$null=&git -C $reservationRepo config user.email "fixture@xlb.invalid";$null=&git -C $reservationRepo config user.name "XLB Fixture"
    $reservationLedgerPath=Join-Path $reservationLedgerDir "migration-reservations.json";$emptyReservationLedger=[ordered]@{schemaVersion=2;reservations=@()}
    [IO.File]::WriteAllText($reservationLedgerPath,($emptyReservationLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture empty reservation ledger"
    if($LASTEXITCODE-ne0){throw"fixture empty reservation ledger commit failed"};$reservationBaseline=(&git -C $reservationRepo rev-parse HEAD).Trim();$reservationTime="2026-07-14T03:00:00+08:00"
    function New-ReservationFixture([string]$Number,[string]$Status,[string]$Filename){
      return [pscustomobject][ordered]@{number=$Number;expectedFilename=$Filename;trainId="RT-RESERVATION-FIXTURE";workUnitId="WU-RESERVATION-FIXTURE-$Number";owner="Migration Owner";baseCommit=$reservationBaseline;tables=@("fixture_table_$Number");semanticScope="fixture reservation $Number";status=$Status;createdAt=$reservationTime;closedAt=$(if($Status-eq"MERGED"){$reservationTime}else{"PENDING"});reason=$(if($Status-eq"MERGED"){"fixture direct terminal introduction"}else{"PENDING"})}
    }
    $directMerged=New-ReservationFixture "058" "MERGED" "058_direct_merged.sql";$directMergedLedger=[ordered]@{schemaVersion=2;reservations=@($directMerged)}
    [IO.File]::WriteAllText($reservationLedgerPath,($directMergedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $reservationMigrationDir "058_direct_merged.sql"),"-- direct MERGED fixture",[Text.Encoding]::UTF8)
    $null=&git -C $reservationRepo add governance/execution/migration-reservations.json db/migrations/058_direct_merged.sql;$null=&git -C $reservationRepo commit -m "fixture direct MERGED reservation introduction"
    Assert-Rejected "production migration reservation introduced directly as MERGED with SQL" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($directMerged) } }
    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore failed"}
    $directMaterialized=New-ReservationFixture "059" "MATERIALIZED" "059_direct_materialized.sql";$directMaterializedLedger=[ordered]@{schemaVersion=2;reservations=@($directMaterialized)}
    [IO.File]::WriteAllText($reservationLedgerPath,($directMaterializedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture direct MATERIALIZED reservation introduction"
    Assert-Rejected "production migration reservation introduced directly as MATERIALIZED" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($directMaterialized) } }
    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for positive path failed"}
    $reserved=New-ReservationFixture "060" "RESERVED" "060_reserved_then_materialized.sql";$reservedLedger=[ordered]@{schemaVersion=2;reservations=@($reserved)}
    [IO.File]::WriteAllText($reservationLedgerPath,($reservedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture reservation before SQL"
    Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($reserved) }
    $materialized=New-ReservationFixture "060" "MATERIALIZED" "060_reserved_then_materialized.sql";$materializedLedger=[ordered]@{schemaVersion=2;reservations=@($materialized)}
    $null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    [IO.File]::WriteAllText($reservationLedgerPath,($materializedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $reservationMigrationDir "060_reserved_then_materialized.sql"),"-- materialized after reservation",[Text.Encoding]::UTF8)
    $null=&git -C $reservationRepo add governance/execution/migration-reservations.json db/migrations/060_reserved_then_materialized.sql;$null=&git -C $reservationRepo commit -m "fixture materialize after reservation"
    Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($materialized) }
    Write-Host "self-test accepted: reservation introduction precedes migration materialization"

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for alternate filename failed"}
    $null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force;$alternateOldPath=Join-Path $reservationMigrationDir "061_old_name.sql"
    [IO.File]::WriteAllText($alternateOldPath,"-- SQL existed before reservation under another name",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add db/migrations/061_old_name.sql;$null=&git -C $reservationRepo commit -m "fixture SQL before reservation under alternate filename"
    Remove-Item -LiteralPath $alternateOldPath -Force;$null=&git -C $reservationRepo add -u -- db/migrations/061_old_name.sql;$null=&git -C $reservationRepo commit -m "fixture remove pre-reservation alternate SQL"
    $alternateReserved=New-ReservationFixture "061" "RESERVED" "061_final_name.sql";$alternateReservedLedger=[ordered]@{schemaVersion=2;reservations=@($alternateReserved)}
    [IO.File]::WriteAllText($reservationLedgerPath,($alternateReservedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture late reservation after alternate SQL history"
    $alternateMaterialized=New-ReservationFixture "061" "MATERIALIZED" "061_final_name.sql";$alternateMaterializedLedger=[ordered]@{schemaVersion=2;reservations=@($alternateMaterialized)};$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    [IO.File]::WriteAllText($reservationLedgerPath,($alternateMaterializedLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $reservationMigrationDir "061_final_name.sql"),"-- final SQL after late reservation",[Text.Encoding]::UTF8)
    $null=&git -C $reservationRepo add governance/execution/migration-reservations.json db/migrations/061_final_name.sql;$null=&git -C $reservationRepo commit -m "fixture final SQL after late reservation"
    Assert-Rejected "production migration number had alternate SQL history before reservation" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($alternateMaterialized) } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for sibling history failed"}
    $siblingReserved=New-ReservationFixture "062" "RESERVED" "062_sibling.sql";$siblingLedger=[ordered]@{schemaVersion=2;reservations=@($siblingReserved)}
    [IO.File]::WriteAllText($reservationLedgerPath,($siblingLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture sibling reservation branch";$siblingReservationCommit=(&git -C $reservationRepo rev-parse HEAD).Trim()
    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture sibling SQL branch checkout failed"};$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    [IO.File]::WriteAllText((Join-Path $reservationMigrationDir "062_sibling.sql"),"-- sibling SQL branch",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add db/migrations/062_sibling.sql;$null=&git -C $reservationRepo commit -m "fixture sibling SQL branch"
    $null=&git -C $reservationRepo merge --no-ff $siblingReservationCommit -m "fixture merge sibling reservation and SQL";if($LASTEXITCODE-ne0){throw"fixture sibling history merge failed"}
    Assert-Rejected "production reservation commit is sibling rather than ancestor of SQL introduction" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($siblingReserved) } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for merge-only SQL failed"}
    [IO.File]::WriteAllText((Join-Path $reservationRepo "merge-left.txt"),"left parent",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add merge-left.txt;$null=&git -C $reservationRepo commit -m "fixture merge-only SQL left parent";$mergeLeftCommit=(&git -C $reservationRepo rev-parse HEAD).Trim()
    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;[IO.File]::WriteAllText((Join-Path $reservationRepo "merge-right.txt"),"right parent",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add merge-right.txt;$null=&git -C $reservationRepo commit -m "fixture merge-only SQL right parent"
    $null=&git -C $reservationRepo merge --no-ff --no-commit $mergeLeftCommit;if($LASTEXITCODE-ne0){throw"fixture merge-only SQL no-commit merge failed"};$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    [IO.File]::WriteAllText((Join-Path $reservationMigrationDir "063_merge_resolution.sql"),"-- introduced only by merge resolution",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add db/migrations/063_merge_resolution.sql;$null=&git -C $reservationRepo commit -m "fixture merge resolution introduces SQL";$mergeOnlySqlCommit=(&git -C $reservationRepo rev-parse HEAD).Trim()
    $lateMergeReservation=New-ReservationFixture "063" "RESERVED" "063_merge_resolution.sql";$lateMergeLedger=[ordered]@{schemaVersion=2;reservations=@($lateMergeReservation)}
    [IO.File]::WriteAllText($reservationLedgerPath,($lateMergeLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture reservation after merge-only SQL"
    Assert-Rejected "production merge-resolution-only SQL introduction before reservation" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($lateMergeReservation) } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for 024 history failed"}
    $bootstrap024=[pscustomobject][ordered]@{number="024";expectedFilename="NONE_PERMANENT_GAP_024";trainId="HISTORICAL-GOVERNANCE";workUnitId="NONE";owner="Migration Owner";baseCommit=$reservationBaseline;tables=@();semanticScope="permanent reserved gap; never reuse";status="ABANDONED";createdAt=$reservationTime;closedAt=$reservationTime;reason="fixture bootstrap permanent gap"};$bootstrap024Ledger=[ordered]@{schemaVersion=2;reservations=@($bootstrap024)}
    [IO.File]::WriteAllText($reservationLedgerPath,($bootstrap024Ledger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture bootstrap permanent 024 gap";$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    $probe024=Join-Path $reservationMigrationDir "024_probe.sql";[IO.File]::WriteAllText($probe024,"-- forbidden permanent gap probe",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add db/migrations/024_probe.sql;$null=&git -C $reservationRepo commit -m "fixture misuse permanent 024 gap";Remove-Item -LiteralPath $probe024 -Force;$null=&git -C $reservationRepo add -u -- db/migrations/024_probe.sql;$null=&git -C $reservationRepo commit -m "fixture hide permanent 024 misuse"
    Assert-Rejected "production permanent 024 gap has any reachable SQL introduction" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($bootstrap024) } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for orphan SQL failed"};$null=New-Item -ItemType Directory -Path $reservationMigrationDir -Force
    $orphanSql=Join-Path $reservationMigrationDir "064_orphan.sql";[IO.File]::WriteAllText($orphanSql,"-- no reservation ever existed",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add db/migrations/064_orphan.sql;$null=&git -C $reservationRepo commit -m "fixture orphan SQL introduction";Remove-Item -LiteralPath $orphanSql -Force;$null=&git -C $reservationRepo add -u -- db/migrations/064_orphan.sql;$null=&git -C $reservationRepo commit -m "fixture hide orphan SQL"
    Assert-Rejected "production deleted SQL history without any reservation" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @() } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for delete readd failed"}
    $deleteReaddReservation=New-ReservationFixture "065" "RESERVED" "065_delete_readd.sql";$deleteReaddLedger=[ordered]@{schemaVersion=2;reservations=@($deleteReaddReservation)}
    [IO.File]::WriteAllText($reservationLedgerPath,($deleteReaddLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture reservation first introduction";[IO.File]::WriteAllText($reservationLedgerPath,($emptyReservationLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture delete reservation record"
    [IO.File]::WriteAllText($reservationLedgerPath,($deleteReaddLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json;$null=&git -C $reservationRepo commit -m "fixture readd reservation record"
    Assert-Rejected "production reservation record delete and re-add" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($deleteReaddReservation) } }

    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;if($LASTEXITCODE-ne0){throw"fixture reservation baseline restore for duplicate sibling introduction failed"}
    $siblingDuplicateReservation=New-ReservationFixture "066" "RESERVED" "066_duplicate_sibling.sql";$siblingDuplicateLedger=[ordered]@{schemaVersion=2;reservations=@($siblingDuplicateReservation)}
    [IO.File]::WriteAllText($reservationLedgerPath,($siblingDuplicateLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $reservationRepo "reservation-sibling-a.txt"),"sibling A",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json reservation-sibling-a.txt;$null=&git -C $reservationRepo commit -m "fixture reservation sibling introduction A";$reservationSiblingA=(&git -C $reservationRepo rev-parse HEAD).Trim()
    $null=&git -C $reservationRepo checkout --detach $reservationBaseline;[IO.File]::WriteAllText($reservationLedgerPath,($siblingDuplicateLedger|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $reservationRepo "reservation-sibling-b.txt"),"sibling B",[Text.Encoding]::UTF8);$null=&git -C $reservationRepo add governance/execution/migration-reservations.json reservation-sibling-b.txt;$null=&git -C $reservationRepo commit -m "fixture reservation sibling introduction B";$null=&git -C $reservationRepo merge --no-ff $reservationSiblingA -m "fixture merge duplicate reservation introductions";if($LASTEXITCODE-ne0){throw"fixture duplicate reservation merge failed"}
    Assert-Rejected "production duplicate reservation introductions on sibling branches" { Invoke-WithRepositoryRoot $reservationRepo { Assert-ReservationLedgerHistory @($siblingDuplicateReservation) } }

    $queueHistoryRepo=Join-Path $fixtureRoot "queue-history-repo";$fixtureDirs+=$queueHistoryRepo;$queueHistoryDir=Join-Path $queueHistoryRepo "governance/execution";$queueManifestDir=Join-Path $queueHistoryDir "work-units";$null=New-Item -ItemType Directory -Path $queueManifestDir -Force
    $null=&git -C $queueHistoryRepo init;$null=&git -C $queueHistoryRepo config user.email "fixture@xlb.invalid";$null=&git -C $queueHistoryRepo config user.name "XLB Fixture"
    $queueHistoryPath=Join-Path $queueHistoryDir "integration-queue.json";$queueManifestPath=Join-Path $queueManifestDir "WU-QUEUE-HISTORY.json";$queueHistoryTime="2026-07-14T02:00:00+08:00"
    $queueHistory=[ordered]@{items=@()};$queueManifest=[ordered]@{workUnitId="WU-QUEUE-HISTORY";trainId="RT-QUEUE-HISTORY";status="PACKAGE_AUDITED"}
    [IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($queueManifestPath,($queueManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $queueHistoryRepo add governance/execution;$null=&git -C $queueHistoryRepo commit -m "fixture queue parent state";$queueHistoryBaseline=(&git -C $queueHistoryRepo rev-parse HEAD).Trim()
    $queueHistoryItem=[pscustomobject][ordered]@{sequence=1;trainId="RT-QUEUE-HISTORY";workUnitId="WU-QUEUE-HISTORY";status="QUEUED";previousStatus="PACKAGE_AUDITED";statusChangedAt=$queueHistoryTime;transitionAuthorityRef="governance/execution/transitions/QUEUE-HISTORY.json";candidateCommit=('1'*40);candidateDigest=('2'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=('3'*40);contractRevision=('4'*40);environmentDigest=('5'*64);candidateRecordRef="governance/execution/evidence/CANDIDATE-A.json";evidenceRefs=@("governance/execution/evidence/EVIDENCE-A.json");auditRefs=@("governance/execution/evidence/AUDIT-A.json");evidenceBindings=@();auditBindings=@()}
    $queueHistory.items=@($queueHistoryItem);$queueManifest.status="QUEUED"
    [IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($queueManifestPath,($queueManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $queueHistoryRepo add governance/execution;$null=&git -C $queueHistoryRepo commit -m "fixture queue item introduction";$queueHistoryIntroduction=(&git -C $queueHistoryRepo rev-parse HEAD).Trim()
    $queueHistoryRecord=[pscustomobject]@{File=$queueManifestPath;TrainId="RT-QUEUE-HISTORY";WorkUnitId="WU-QUEUE-HISTORY"}
    Invoke-WithRepositoryRoot $queueHistoryRepo { Assert-QueueItemHistoryBinding $queueHistoryItem $queueHistoryRecord 1 $queueHistoryBaseline }
    $queueHistoryItem.auditRefs=@("governance/execution/evidence/AUDIT-B.json");$queueHistory.items=@($queueHistoryItem);[IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $queueHistoryRepo add governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture queue audit ref substitution"
    Assert-Rejected "production Queue item cannot substitute immutable audit closure ref" { Invoke-WithRepositoryRoot $queueHistoryRepo { Assert-QueueItemHistoryBinding $queueHistoryItem $queueHistoryRecord 1 $queueHistoryBaseline } }
    $null=&git -C $queueHistoryRepo checkout --detach $queueHistoryIntroduction;if($LASTEXITCODE-ne0){throw"fixture queue introduction restore failed"};$queueHistory=Get-Content -Raw -Encoding UTF8 $queueHistoryPath|ConvertFrom-Json;$queueHistoryItem=$queueHistory.items[0]
    $queueHistoryItem.previousStatus="IN_CONSTRUCTION";$queueHistory.items=@($queueHistoryItem);[IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $queueHistoryRepo add governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture queue previousStatus tamper"
    Assert-Rejected "production Queue item previousStatus differs from immutable Work Unit parent" { Invoke-WithRepositoryRoot $queueHistoryRepo { Assert-QueueItemHistoryBinding $queueHistoryItem $queueHistoryRecord 1 $queueHistoryBaseline } }

    $null=&git -C $queueHistoryRepo checkout --detach $queueHistoryIntroduction;if($LASTEXITCODE-ne0){throw"fixture queue sibling baseline restore failed"};$queueHistory=Get-Content -Raw -Encoding UTF8 $queueHistoryPath|ConvertFrom-Json;$queueHistory.items[0].auditRefs=@("governance/execution/evidence/AUDIT-SIBLING-TAMPER.json");[IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $queueHistoryRepo add governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture queue sibling tamper";$queueTamperCommit=(&git -C $queueHistoryRepo rev-parse HEAD).Trim()
    $null=&git -C $queueHistoryRepo checkout --detach $queueHistoryIntroduction;[IO.File]::WriteAllText((Join-Path $queueHistoryRepo "queue-sibling.txt"),"canonical sibling",[Text.Encoding]::UTF8);$null=&git -C $queueHistoryRepo add queue-sibling.txt;$null=&git -C $queueHistoryRepo commit -m "fixture queue canonical sibling";$null=&git -C $queueHistoryRepo merge --no-ff --no-commit $queueTamperCommit;if($LASTEXITCODE-ne0){throw"fixture queue sibling merge preparation failed"};$null=&git -C $queueHistoryRepo checkout HEAD -- governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture queue merge resolution restores canonical item";if($LASTEXITCODE-ne0){throw"fixture queue merge resolution commit failed"}
    $queueHistory=Get-Content -Raw -Encoding UTF8 $queueHistoryPath|ConvertFrom-Json;$queueHistoryItem=$queueHistory.items[0]
    Assert-Rejected "production Queue item sibling tamper hidden by merge resolution" { Invoke-WithRepositoryRoot $queueHistoryRepo { Assert-QueueItemHistoryBinding $queueHistoryItem $queueHistoryRecord 1 $queueHistoryBaseline } }

    $null=&git -C $queueHistoryRepo checkout --detach $queueHistoryIntroduction;if($LASTEXITCODE-ne0){throw"fixture queue delete/readd baseline restore failed"};$queueHistory=Get-Content -Raw -Encoding UTF8 $queueHistoryPath|ConvertFrom-Json;$queueHistory.items=@();[IO.File]::WriteAllText($queueHistoryPath,($queueHistory|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $queueHistoryRepo add governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture delete queued item";$null=&git -C $queueHistoryRepo checkout $queueHistoryIntroduction -- governance/execution/integration-queue.json;$null=&git -C $queueHistoryRepo commit -m "fixture readd queued item";$queueHistory=Get-Content -Raw -Encoding UTF8 $queueHistoryPath|ConvertFrom-Json;$queueHistoryItem=$queueHistory.items[0]
    Assert-Rejected "production Queue item delete and re-add" { Invoke-WithRepositoryRoot $queueHistoryRepo { Assert-QueueItemHistoryBinding $queueHistoryItem $queueHistoryRecord 1 $queueHistoryBaseline } }

    # Terminal package closure is retained across STALE -> ABANDONED, and strict
    # evidence/audit records remain immutable even after a package leaves the
    # active queue.  This is deliberately exercised through the production
    # history/strict-record validators rather than a schema-only helper.
    $staleClosureRepo=Join-Path $fixtureRoot "stale-closure-repo";$fixtureDirs+=$staleClosureRepo
    $staleClosureManifestRef="governance/execution/work-units/WU-STALE-CLOSURE.json";$staleClosureManifestPath=Join-Path $staleClosureRepo $staleClosureManifestRef
    $staleClosureEvidenceRef="governance/execution/evidence/EVIDENCE-STALE-CLOSURE.json";$staleClosureEvidencePath=Join-Path $staleClosureRepo $staleClosureEvidenceRef
    $staleClosureAuditRef="governance/execution/evidence/AUDIT-STALE-CLOSURE.json";$staleClosureAuditPath=Join-Path $staleClosureRepo $staleClosureAuditRef
    $staleClosureTransitionDir=Join-Path $staleClosureRepo "governance/execution/transitions";$null=New-Item -ItemType Directory -Path (Split-Path $staleClosureManifestPath),$staleClosureTransitionDir,(Split-Path $staleClosureEvidencePath) -Force
    $null=&git -C $staleClosureRepo init;$null=&git -C $staleClosureRepo config user.email "fixture@xlb.invalid";$null=&git -C $staleClosureRepo config user.name "XLB Fixture"
    $staleBase=('1'*40);$staleCandidate=('2'*40);$staleDigest=('3'*64);$staleEnvDigest=('4'*64);$staleContract=('5'*40);$staleTime="2026-07-14T07:20:00+08:00"
    $staleEvidence=[ordered]@{schemaVersion=1;recordType="EVIDENCE";recordId="EVIDENCE-STALE-CLOSURE";createdAt=$staleTime;trainId="RT-STALE-CLOSURE";workUnitId="WU-STALE-CLOSURE";candidateCommit=$staleCandidate;candidateDigest=$staleDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$staleBase;contractRevision=$staleContract;environmentDigest=$staleEnvDigest;result="PASS";checks=@("CLEAN_WORKTREE_RECORDED","IMMUTABLE_COMMIT_VERIFIED");actorRole="Package Agent"}
    $staleAudit=[ordered]@{schemaVersion=1;recordType="INDEPENDENT_AUDIT";recordId="AUDIT-STALE-CLOSURE";createdAt=$staleTime;trainId="RT-STALE-CLOSURE";workUnitId="WU-STALE-CLOSURE";candidateCommit=$staleCandidate;candidateDigest=$staleDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$staleBase;contractRevision=$staleContract;environmentDigest=$staleEnvDigest;result="PASS";independentFromWriter=$true;evidenceRefs=@($staleClosureEvidenceRef);evidenceBindings=@();checks=@("PACKAGE_EVIDENCE_BINDINGS_VERIFIED");actorRole="Audit Agent"}
    $staleManifest=[ordered]@{trainId="RT-STALE-CLOSURE";workUnitId="WU-STALE-CLOSURE";status="PACKAGE_AUDITED";previousStatus="PACKAGE_VERIFIED";statusChangedAt=$staleTime;transitionAuthorityRef="governance/execution/transitions/WU-STALE-CLOSURE-STALE.json";candidateCommit=$staleCandidate;candidateDigest=$staleDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";candidateRecordRef=$staleClosureEvidenceRef;baseCommit=$staleBase;contractRevision=$staleContract;environmentDigest=$staleEnvDigest;evidenceRefs=@($staleClosureEvidenceRef);evidenceBindings=@();auditRefs=@($staleClosureAuditRef);auditBindings=@()}
    $staleTransition=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-STALE-CLOSURE-STALE";createdAt=$staleTime;subjectType="WORK_UNIT";subjectId="WU-STALE-CLOSURE";trainId="RT-STALE-CLOSURE";workUnitId="WU-STALE-CLOSURE";previousStatus="PACKAGE_AUDITED";currentStatus="STALE";changedAt=$staleTime;scope="WORK_UNIT_EXECUTION_CONTROL";decision="APPROVED";actorRole="Audit Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    [IO.File]::WriteAllText($staleClosureEvidencePath,($staleEvidence|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($staleClosureAuditPath,($staleAudit|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($staleClosureManifestPath,($staleManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $staleClosureTransitionDir "WU-STALE-CLOSURE-STALE.json"),($staleTransition|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $staleClosureRepo add governance/execution;$null=&git -C $staleClosureRepo commit -m "fixture stale package closure baseline";$staleClosureBaseline=(&git -C $staleClosureRepo rev-parse HEAD).Trim()
    $staleManifest=Get-Content -Raw -Encoding UTF8 $staleClosureManifestPath|ConvertFrom-Json;$staleManifest.status="STALE";$staleManifest.previousStatus="PACKAGE_AUDITED";$staleManifest.statusChangedAt=$staleTime;$staleManifest.transitionAuthorityRef="governance/execution/transitions/WU-STALE-CLOSURE-STALE.json";[IO.File]::WriteAllText($staleClosureManifestPath,($staleManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $staleClosureRepo add $staleClosureManifestRef;$null=&git -C $staleClosureRepo commit -m "fixture package enters stale";$staleManifest=Get-Content -Raw -Encoding UTF8 $staleClosureManifestPath|ConvertFrom-Json
    $abandonedRef="governance/execution/transitions/WU-STALE-CLOSURE-ABANDONED.json";$abandonedRecord=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-STALE-CLOSURE-ABANDONED";createdAt="2026-07-14T07:21:00+08:00";subjectType="WORK_UNIT";subjectId="WU-STALE-CLOSURE";trainId="RT-STALE-CLOSURE";workUnitId="WU-STALE-CLOSURE";previousStatus="STALE";currentStatus="ABANDONED";changedAt="2026-07-14T07:21:00+08:00";scope="WORK_UNIT_EXECUTION_CONTROL";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText((Join-Path $staleClosureRepo $abandonedRef),($abandonedRecord|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$staleManifest.status="ABANDONED";$staleManifest.previousStatus="STALE";$staleManifest.statusChangedAt="2026-07-14T07:21:00+08:00";$staleManifest.transitionAuthorityRef=$abandonedRef;$staleManifest.candidateDigest=('9'*64);[IO.File]::WriteAllText($staleClosureManifestPath,($staleManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $staleClosureRepo add governance/execution;$null=&git -C $staleClosureRepo commit -m "fixture abandoned stale closure tamper"
    Assert-Rejected "production STALE to ABANDONED cannot replace package closure" { Invoke-WithRepositoryRoot $staleClosureRepo { Assert-StatusHistoryBinding $staleClosureManifestRef "WORK_UNIT" "WU-STALE-CLOSURE" "ABANDONED" "STALE" "2026-07-14T07:21:00+08:00" $abandonedRef "RT-STALE-CLOSURE" "WU-STALE-CLOSURE" "" } }
    $tamperedStaleEvidence=Get-Content -Raw -Encoding UTF8 $staleClosureEvidencePath|ConvertFrom-Json;$tamperedStaleEvidence.checks=@("CLEAN_WORKTREE_RECORDED","IMMUTABLE_COMMIT_VERIFIED","TAMPERED_AFTER_STALE");[IO.File]::WriteAllText($staleClosureEvidencePath,($tamperedStaleEvidence|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $staleClosureRepo add $staleClosureEvidenceRef;$null=&git -C $staleClosureRepo commit -m "fixture stale package evidence rewrite";Assert-Rejected "production stale package strict evidence cannot be rewritten" { Invoke-WithRepositoryRoot $staleClosureRepo { Assert-AllCanonicalStrictRecordHistory } }

    # Positive repository golden path: package evidence/audit -> queue ->
    # integrated -> closed.  The fixture calls the same production package,
    # queue-history, and status-history validators used by Repository mode.
    $goldenRepo=Join-Path $fixtureRoot "repository-golden-path";$fixtureDirs+=$goldenRepo;$goldenManifestRef="governance/execution/work-units/WU-GOLDEN-PACKAGE.json";$goldenManifestPath=Join-Path $goldenRepo $goldenManifestRef;$goldenQueueRef="governance/execution/integration-queue.json";$goldenQueuePath=Join-Path $goldenRepo $goldenQueueRef;$goldenEvidenceRef="governance/execution/evidence/EVIDENCE-GOLDEN-PACKAGE.json";$goldenAuditRef="governance/execution/evidence/AUDIT-GOLDEN-PACKAGE.json";$goldenEvidencePath=Join-Path $goldenRepo $goldenEvidenceRef;$goldenAuditPath=Join-Path $goldenRepo $goldenAuditRef;$goldenTransitionDir=Join-Path $goldenRepo "governance/execution/transitions";$null=New-Item -ItemType Directory -Path (Split-Path $goldenManifestPath),$goldenTransitionDir,(Split-Path $goldenEvidencePath) -Force
    $null=&git -C $goldenRepo init;$null=&git -C $goldenRepo config user.email "fixture@xlb.invalid";$null=&git -C $goldenRepo config user.name "XLB Fixture"
    $goldenTime="2026-07-14T07:40:00+08:00";$goldenBase=('a'*40);$goldenTrain="RT-GOLDEN-PACKAGE";$goldenUnit="WU-GOLDEN-PACKAGE";$goldenEnvDigest=('b'*64);$goldenContract=('c'*40)
    $goldenManifest=[ordered]@{trainId=$goldenTrain;workUnitId=$goldenUnit;status="IN_CONSTRUCTION";previousStatus="CONSTRUCTION_AUTHORIZED";statusChangedAt=$goldenTime;transitionAuthorityRef="governance/execution/transitions/INITIAL.json";baseCommit=$goldenBase;contractRevision=$goldenContract;environmentDigest=$goldenEnvDigest;candidateCommit="";candidateDigest="";candidateDigestAlgorithm="";candidateRecordRef="";evidenceRefs=@();evidenceBindings=@();auditRefs=@();auditBindings=@()}
    $goldenQueue=[ordered]@{nextSequence=1;items=@()};[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($goldenQueuePath,($goldenQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path construction baseline";$goldenInitial=(&git -C $goldenRepo rev-parse HEAD).Trim()
    [IO.File]::WriteAllText((Join-Path $goldenRepo "candidate.txt"),"immutable candidate",[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add candidate.txt;$null=&git -C $goldenRepo commit -m "fixture golden path candidate";$goldenCandidate=(&git -C $goldenRepo rev-parse HEAD).Trim();$goldenCandidateDigest=Invoke-WithRepositoryRoot $goldenRepo { Get-CandidateDigest $goldenCandidate }
    $goldenEvidence=[ordered]@{schemaVersion=1;recordType="EVIDENCE";recordId="EVIDENCE-GOLDEN-PACKAGE";createdAt=$goldenTime;trainId=$goldenTrain;workUnitId=$goldenUnit;candidateCommit=$goldenCandidate;candidateDigest=$goldenCandidateDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$goldenBase;contractRevision=$goldenContract;environmentDigest=$goldenEnvDigest;result="PASS";checks=@("CLEAN_WORKTREE_RECORDED","IMMUTABLE_COMMIT_VERIFIED");actorRole="Construction Owner"};[IO.File]::WriteAllText($goldenEvidencePath,($goldenEvidence|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add $goldenEvidenceRef;$null=&git -C $goldenRepo commit -m "fixture golden path package evidence"
    $goldenEvidenceBlob=(&git -C $goldenRepo rev-parse "HEAD`:$goldenEvidenceRef").Trim();$goldenEvidenceCanonicalDigest=Get-CanonicalRecordDigest $goldenEvidence;$goldenAudit=[ordered]@{schemaVersion=1;recordType="INDEPENDENT_AUDIT";recordId="AUDIT-GOLDEN-PACKAGE";createdAt=$goldenTime;trainId=$goldenTrain;workUnitId=$goldenUnit;candidateCommit=$goldenCandidate;candidateDigest=$goldenCandidateDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$goldenBase;contractRevision=$goldenContract;environmentDigest=$goldenEnvDigest;result="PASS";independentFromWriter=$true;evidenceRefs=@($goldenEvidenceRef);evidenceBindings=@([ordered]@{ref=$goldenEvidenceRef;sha256=$goldenEvidenceCanonicalDigest;blobOid=$goldenEvidenceBlob});checks=@("PACKAGE_EVIDENCE_BINDINGS_VERIFIED");actorRole="Audit Agent"};[IO.File]::WriteAllText($goldenAuditPath,($goldenAudit|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add $goldenAuditRef;$null=&git -C $goldenRepo commit -m "fixture golden path independent audit"
    $goldenEvidenceBlob=(&git -C $goldenRepo rev-parse "HEAD`:$goldenEvidenceRef").Trim();$goldenEvidenceCanonicalDigest=Get-CanonicalRecordDigest $goldenEvidence;$goldenManifest=Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json;$goldenManifest.status="PACKAGE_VERIFIED";$goldenManifest.previousStatus="IN_CONSTRUCTION";$goldenManifest.statusChangedAt="2026-07-14T07:41:00+08:00";$goldenManifest.transitionAuthorityRef="governance/execution/transitions/GOLDEN-PACKAGE-VERIFIED.json";$goldenManifest.candidateCommit=$goldenCandidate;$goldenManifest.candidateDigest=$goldenCandidateDigest;$goldenManifest.candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";$goldenManifest.candidateRecordRef=$goldenEvidenceRef;$goldenManifest.evidenceRefs=@($goldenEvidenceRef);$goldenManifest.evidenceBindings=@([ordered]@{ref=$goldenEvidenceRef;sha256=$goldenEvidenceCanonicalDigest;blobOid=$goldenEvidenceBlob});[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$goldenPv=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-PACKAGE-VERIFIED";createdAt="2026-07-14T07:41:00+08:00";subjectType="WORK_UNIT";subjectId=$goldenUnit;trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="IN_CONSTRUCTION";currentStatus="PACKAGE_VERIFIED";changedAt="2026-07-14T07:41:00+08:00";scope="WORK_UNIT_PACKAGE_VERIFICATION";decision="APPROVED";actorRole="Construction Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-PACKAGE-VERIFIED.json"),($goldenPv|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path package verified"
    $goldenAuditBlob=(&git -C $goldenRepo rev-parse "HEAD`:$goldenAuditRef").Trim();$goldenAuditCanonicalDigest=Get-CanonicalRecordDigest $goldenAudit;$goldenManifest=Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json;$goldenManifest.status="PACKAGE_AUDITED";$goldenManifest.previousStatus="PACKAGE_VERIFIED";$goldenManifest.statusChangedAt="2026-07-14T07:42:00+08:00";$goldenManifest.transitionAuthorityRef="governance/execution/transitions/GOLDEN-PACKAGE-AUDITED.json";$goldenManifest.auditRefs=@($goldenAuditRef);$goldenManifest.auditBindings=@([ordered]@{ref=$goldenAuditRef;sha256=$goldenAuditCanonicalDigest;blobOid=$goldenAuditBlob});$goldenPa=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-PACKAGE-AUDITED";createdAt="2026-07-14T07:42:00+08:00";subjectType="WORK_UNIT";subjectId=$goldenUnit;trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="PACKAGE_VERIFIED";currentStatus="PACKAGE_AUDITED";changedAt="2026-07-14T07:42:00+08:00";scope="WORK_UNIT_PACKAGE_AUDIT";decision="APPROVED";actorRole="Audit Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-PACKAGE-AUDITED.json"),($goldenPa|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path package audited"
    $goldenManifest=Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json;$goldenManifest.status="QUEUED";$goldenManifest.previousStatus="PACKAGE_AUDITED";$goldenManifest.statusChangedAt="2026-07-14T07:43:00+08:00";$goldenManifest.transitionAuthorityRef="governance/execution/transitions/GOLDEN-QUEUED.json";$goldenItem=[ordered]@{sequence=1;trainId=$goldenTrain;workUnitId=$goldenUnit;status="QUEUED";previousStatus="PACKAGE_AUDITED";statusChangedAt="2026-07-14T07:43:00+08:00";submittedAt="2026-07-14T07:43:00+08:00";transitionAuthorityRef="governance/execution/transitions/GOLDEN-QUEUE-ITEM-QUEUED.json";candidateCommit=$goldenCandidate;candidateDigest=$goldenCandidateDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$goldenBase;contractRevision=$goldenContract;environmentDigest=$goldenEnvDigest;candidateRecordRef=$goldenEvidenceRef;evidenceRefs=@($goldenEvidenceRef);auditRefs=@($goldenAuditRef);evidenceBindings=@([ordered]@{ref=$goldenEvidenceRef;sha256=$goldenEvidenceCanonicalDigest;blobOid=$goldenEvidenceBlob});auditBindings=@([ordered]@{ref=$goldenAuditRef;sha256=$goldenAuditCanonicalDigest;blobOid=$goldenAuditBlob})};$goldenQueue.items=@($goldenItem);$goldenQueue.nextSequence=2;$goldenQ=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-QUEUED";createdAt="2026-07-14T07:43:00+08:00";subjectType="WORK_UNIT";subjectId=$goldenUnit;trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="PACKAGE_AUDITED";currentStatus="QUEUED";changedAt="2026-07-14T07:43:00+08:00";scope="INTEGRATION_QUEUE_CONTROL";decision="APPROVED";actorRole="Integration Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};$goldenQi=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-QUEUE-ITEM-QUEUED";createdAt="2026-07-14T07:43:00+08:00";subjectType="QUEUE_ITEM";subjectId="$goldenTrain/$goldenUnit/1";trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="PACKAGE_AUDITED";currentStatus="QUEUED";changedAt="2026-07-14T07:43:00+08:00";scope="INTEGRATION_QUEUE_CONTROL";decision="APPROVED";actorRole="Integration Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($goldenQueuePath,($goldenQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-QUEUED.json"),($goldenQ|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-QUEUE-ITEM-QUEUED.json"),($goldenQi|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path queued"
    $goldenManifest=Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json;$goldenManifest.status="INTEGRATED";$goldenManifest.previousStatus="QUEUED";$goldenManifest.statusChangedAt="2026-07-14T07:44:00+08:00";$goldenManifest.transitionAuthorityRef="governance/execution/transitions/GOLDEN-INTEGRATED.json";$goldenQueue=Get-Content -Raw -Encoding UTF8 $goldenQueuePath|ConvertFrom-Json;$goldenQueue.items=@();$goldenI=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-INTEGRATED";createdAt="2026-07-14T07:44:00+08:00";subjectType="WORK_UNIT";subjectId=$goldenUnit;trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="QUEUED";currentStatus="INTEGRATED";changedAt="2026-07-14T07:44:00+08:00";scope="SERIAL_INTEGRATION";decision="APPROVED";actorRole="Integration Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($goldenQueuePath,($goldenQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-INTEGRATED.json"),($goldenI|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path integrated"
    $goldenManifest=Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json;$goldenManifest.status="CLOSED";$goldenManifest.previousStatus="INTEGRATED";$goldenManifest.statusChangedAt="2026-07-14T07:45:00+08:00";$goldenManifest.transitionAuthorityRef="governance/execution/transitions/GOLDEN-CLOSED.json";$goldenC=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="GOLDEN-CLOSED";createdAt="2026-07-14T07:45:00+08:00";subjectType="WORK_UNIT";subjectId=$goldenUnit;trainId=$goldenTrain;workUnitId=$goldenUnit;previousStatus="INTEGRATED";currentStatus="CLOSED";changedAt="2026-07-14T07:45:00+08:00";scope="WORK_UNIT_CLOSURE";decision="APPROVED";actorRole="General Contractor Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")};[IO.File]::WriteAllText($goldenManifestPath,($goldenManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $goldenRepo "governance/execution/transitions/GOLDEN-CLOSED.json"),($goldenC|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $goldenRepo add governance/execution;$null=&git -C $goldenRepo commit -m "fixture golden path closed"
    $goldenRecord=[pscustomobject]@{File=$goldenManifestPath;TrainId=$goldenTrain;WorkUnitId=$goldenUnit;Manifest=(Get-Content -Raw -Encoding UTF8 $goldenManifestPath|ConvertFrom-Json);Status="CLOSED"};$goldenRecord.Manifest.evidenceBindings=@($goldenRecord.Manifest.evidenceBindings);$goldenRecord.Manifest.auditBindings=@($goldenRecord.Manifest.auditBindings);$goldenIdentity=@{};$goldenIdentity["$goldenTrain/$goldenUnit".ToLowerInvariant()]=$goldenRecord;$goldenFinalQueue=Get-Content -Raw -Encoding UTF8 $goldenQueuePath|ConvertFrom-Json
    Invoke-WithRepositoryRoot $goldenRepo { Assert-StatusHistoryBinding $goldenManifestRef "WORK_UNIT" $goldenUnit "CLOSED" "INTEGRATED" "2026-07-14T07:45:00+08:00" "governance/execution/transitions/GOLDEN-CLOSED.json" $goldenTrain $goldenUnit "";Assert-AllQueueItemHistoryBindings $goldenIdentity $goldenFinalQueue;Assert-PackageRecordBindings $goldenRecord $goldenCandidate $goldenCandidateDigest $goldenEnvDigest $true }
    Write-Host "self-test accepted: full Repository package -> queue -> integrated -> closed golden path"

    $closureHistoryRepo=Join-Path $fixtureRoot "closure-history-repo";$fixtureDirs+=$closureHistoryRepo;$closureWorkUnitDir=Join-Path $closureHistoryRepo "governance/execution/work-units";$null=New-Item -ItemType Directory -Path $closureWorkUnitDir -Force
    $null=&git -C $closureHistoryRepo init;$null=&git -C $closureHistoryRepo config user.email "fixture@xlb.invalid";$null=&git -C $closureHistoryRepo config user.name "XLB Fixture"
    $closureRegistryRef="governance/execution/train-registry.json";$closureManifestRef="governance/execution/work-units/WU-CLOSURE-HISTORY.json";$closureRegistryPath=Join-Path $closureHistoryRepo $closureRegistryRef;$closureManifestPath=Join-Path $closureHistoryRepo $closureManifestRef
    $closureTrain=[pscustomobject][ordered]@{trainId="RT-CLOSURE-HISTORY";status="DRAFT";previousStatus="NONE";statusChangedAt="2026-07-14T05:00:00+08:00";transitionAuthorityRef="governance/execution/transitions/TRAIN-DRAFT.json";approvalRef="PENDING";humanApprovalStatus="WAITING_HUMAN_APPROVAL";runtimeValidationApprovalRef="PENDING";runtimeValidationAuditRef="PENDING"}
    $closureRegistry=[ordered]@{trains=@($closureTrain)};$closureManifest=[pscustomobject][ordered]@{trainId="RT-CLOSURE-HISTORY";workUnitId="WU-CLOSURE-HISTORY";status="PACKAGE_AUDITED";previousStatus="PACKAGE_VERIFIED";statusChangedAt="2026-07-14T05:00:00+08:00";transitionAuthorityRef="governance/execution/transitions/WU-AUDITED.json";candidateCommit=('1'*40);candidateDigest=('2'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";candidateRecordRef="governance/execution/evidence/CANDIDATE-A.json";baseCommit=('3'*40);contractRevision=('4'*40);environmentDigest=('5'*64);evidenceRefs=@("governance/execution/evidence/EVIDENCE-A.json");evidenceBindings=@();auditRefs=@("governance/execution/evidence/AUDIT-A.json");auditBindings=@()}
    [IO.File]::WriteAllText($closureRegistryPath,($closureRegistry|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($closureManifestPath,($closureManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $closureHistoryRepo add governance/execution;$null=&git -C $closureHistoryRepo commit -m "fixture authority closure baseline";$closureBaseline=(&git -C $closureHistoryRepo rev-parse HEAD).Trim()
    $closureTrain.status="CHARTER_HUMAN_APPROVED";$closureTrain.previousStatus="DRAFT";$closureTrain.statusChangedAt="2026-07-14T05:10:00+08:00";$closureTrain.transitionAuthorityRef="governance/execution/transitions/TRAIN-APPROVED.json";$closureTrain.approvalRef="governance/execution/approvals/TRAIN-APPROVAL-A.json";$closureTrain.humanApprovalStatus="APPROVED";$closureRegistry.trains=@($closureTrain)
    $closureManifest.status="QUEUED";$closureManifest.previousStatus="PACKAGE_AUDITED";$closureManifest.statusChangedAt="2026-07-14T05:10:00+08:00";$closureManifest.transitionAuthorityRef="governance/execution/transitions/WU-QUEUED.json";$closureManifest.auditRefs=@("governance/execution/evidence/AUDIT-B.json")
    [IO.File]::WriteAllText($closureRegistryPath,($closureRegistry|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($closureManifestPath,($closureManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $closureHistoryRepo add governance/execution;$null=&git -C $closureHistoryRepo commit -m "fixture replace audit closure during queue transition"
    $closureFields=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","candidateRecordRef","baseCommit","contractRevision","environmentDigest","evidenceRefs","evidenceBindings","auditRefs","auditBindings")
    Assert-Rejected "production Work Unit transition cannot substitute package audit closure" { Invoke-WithRepositoryRoot $closureHistoryRepo { Assert-StatusHistoryBinding $closureManifestRef "WORK_UNIT" "WU-CLOSURE-HISTORY" "QUEUED" "PACKAGE_AUDITED" "2026-07-14T05:10:00+08:00" "governance/execution/transitions/WU-QUEUED.json" "RT-CLOSURE-HISTORY" "WU-CLOSURE-HISTORY" "" $closureFields $closureFields } }
    $closureTrain.approvalRef="governance/execution/approvals/TRAIN-APPROVAL-B.json";$closureRegistry.trains=@($closureTrain);[IO.File]::WriteAllText($closureRegistryPath,($closureRegistry|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $closureHistoryRepo add governance/execution/train-registry.json;$null=&git -C $closureHistoryRepo commit -m "fixture replace Train approval ref without status transition"
    Assert-Rejected "production Train cannot substitute approvalRef while status is unchanged" { Invoke-WithRepositoryRoot $closureHistoryRepo { Assert-StatusHistoryBinding $closureRegistryRef "RELEASE_TRAIN" "RT-CLOSURE-HISTORY" "CHARTER_HUMAN_APPROVED" "DRAFT" "2026-07-14T05:10:00+08:00" "governance/execution/transitions/TRAIN-APPROVED.json" "RT-CLOSURE-HISTORY" "" $closureBaseline @("approvalRef","humanApprovalStatus") @() } }

    $statusDagRepo=Join-Path $fixtureRoot "status-full-dag-repo";$fixtureDirs+=$statusDagRepo;$statusDagManifestRef="governance/execution/work-units/WU-STATUS-DAG.json";$statusDagManifestPath=Join-Path $statusDagRepo $statusDagManifestRef;$statusDagTransitionRef="governance/execution/transitions/WU-STATUS-DAG-BLOCKED.json";$statusDagTransitionPath=Join-Path $statusDagRepo $statusDagTransitionRef
    $null=New-Item -ItemType Directory -Path (Split-Path $statusDagManifestPath) -Force;$null=New-Item -ItemType Directory -Path (Split-Path $statusDagTransitionPath) -Force;$null=&git -C $statusDagRepo init;$null=&git -C $statusDagRepo config user.email "fixture@xlb.invalid";$null=&git -C $statusDagRepo config user.name "XLB Fixture"
    $statusDagTime="2026-07-14T06:00:00+08:00";$statusDagManifest=[ordered]@{trainId="RT-STATUS-DAG";workUnitId="WU-STATUS-DAG";status="PLANNED";previousStatus="NONE";statusChangedAt="2026-07-14T05:50:00+08:00";transitionAuthorityRef="governance/execution/transitions/WU-STATUS-DAG-PLANNED.json";authorityFlag="CANONICAL"}
    $statusDagTransition=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="WU-STATUS-DAG-BLOCKED";createdAt=$statusDagTime;subjectType="WORK_UNIT";subjectId="WU-STATUS-DAG";trainId="RT-STATUS-DAG";workUnitId="WU-STATUS-DAG";previousStatus="PLANNED";currentStatus="BLOCKED";changedAt=$statusDagTime;scope="WORK_UNIT_EXECUTION_CONTROL";decision="APPROVED";actorRole="General Contractor Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    [IO.File]::WriteAllText($statusDagManifestPath,($statusDagManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($statusDagTransitionPath,($statusDagTransition|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $statusDagRepo add governance/execution;$null=&git -C $statusDagRepo commit -m "fixture status DAG initial epoch";$statusDagBaseline=(&git -C $statusDagRepo rev-parse HEAD).Trim()
    $statusDagManifest.authorityFlag="SIBLING_TAMPER";[IO.File]::WriteAllText($statusDagManifestPath,($statusDagManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $statusDagRepo add $statusDagManifestRef;$null=&git -C $statusDagRepo commit -m "fixture old epoch sibling tamper";$statusDagTamper=(&git -C $statusDagRepo rev-parse HEAD).Trim()
    $null=&git -C $statusDagRepo checkout --detach $statusDagBaseline;[IO.File]::WriteAllText((Join-Path $statusDagRepo "canonical-sibling.txt"),"canonical sibling",[Text.Encoding]::UTF8);$null=&git -C $statusDagRepo add canonical-sibling.txt;$null=&git -C $statusDagRepo commit -m "fixture old epoch canonical sibling";$null=&git -C $statusDagRepo merge --no-ff --no-commit $statusDagTamper;if($LASTEXITCODE-ne0){throw"fixture status DAG sibling merge failed"};$null=&git -C $statusDagRepo checkout $statusDagBaseline -- $statusDagManifestRef;$null=&git -C $statusDagRepo commit -m "fixture old epoch merge resolution restore"
    $statusDagManifest=Get-Content -Raw -Encoding UTF8 $statusDagManifestPath|ConvertFrom-Json;$statusDagManifest.status="BLOCKED";$statusDagManifest.previousStatus="PLANNED";$statusDagManifest.statusChangedAt=$statusDagTime;$statusDagManifest.transitionAuthorityRef=$statusDagTransitionRef;[IO.File]::WriteAllText($statusDagManifestPath,($statusDagManifest|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);$null=&git -C $statusDagRepo add $statusDagManifestRef;$null=&git -C $statusDagRepo commit -m "fixture legal transition after hidden old epoch tamper"
    Assert-Rejected "production historical Work Unit epoch sibling tamper hidden by merge resolution" { Invoke-WithRepositoryRoot $statusDagRepo { Assert-StatusHistoryBinding $statusDagManifestRef "WORK_UNIT" "WU-STATUS-DAG" "BLOCKED" "PLANNED" $statusDagTime $statusDagTransitionRef "RT-STATUS-DAG" "WU-STATUS-DAG" } }

    $null=&git -C $statusDagRepo checkout --detach $statusDagBaseline;if($LASTEXITCODE-ne0){throw"fixture status delete/readd baseline restore failed"};Remove-Item -LiteralPath $statusDagManifestPath -Force;$null=&git -C $statusDagRepo add -u -- $statusDagManifestRef;$null=&git -C $statusDagRepo commit -m "fixture delete initial Work Unit subject";$null=&git -C $statusDagRepo checkout $statusDagBaseline -- $statusDagManifestRef;$null=&git -C $statusDagRepo commit -m "fixture readd initial Work Unit subject"
    Assert-Rejected "production initial Work Unit subject delete and re-add" { Invoke-WithRepositoryRoot $statusDagRepo { Assert-StatusHistoryBinding $statusDagManifestRef "WORK_UNIT" "WU-STATUS-DAG" "PLANNED" "NONE" "2026-07-14T05:50:00+08:00" "governance/execution/transitions/WU-STATUS-DAG-PLANNED.json" "RT-STATUS-DAG" "WU-STATUS-DAG" } }

    $postActivationIntro=[pscustomobject]@{Commit=('0'*40);Parents=@(('1'*40));Snapshot=[pscustomobject]@{Status="PLANNED";Previous="NONE";ChangedAt="2026-07-14T06:05:00+08:00";AuthorityRef="governance/execution/transitions/WU-POST-ACTIVATION-PLANNED.json";Subject=[pscustomobject]@{}}}
    Assert-Rejected "post-activation Work Unit introduction previousStatus must be NONE" { $bad=$postActivationIntro.PSObject.Copy();$bad.Snapshot=$postActivationIntro.Snapshot.PSObject.Copy();$bad.Snapshot.Previous="BLOCKED";Assert-PostActivationSubjectIntroduction $bad "WORK_UNIT" "WU-POST-ACTIVATION" "RT-POST-ACTIVATION" "WU-POST-ACTIVATION" }
    Assert-Rejected "post-activation Work Unit introduction status must be PLANNED" { $bad=$postActivationIntro.PSObject.Copy();$bad.Snapshot=$postActivationIntro.Snapshot.PSObject.Copy();$bad.Snapshot.Status="BLOCKED";Assert-PostActivationSubjectIntroduction $bad "WORK_UNIT" "WU-POST-ACTIVATION" "RT-POST-ACTIVATION" "WU-POST-ACTIVATION" }
    Assert-Rejected "post-activation Work Unit introduction cannot be a merge commit" { $bad=$postActivationIntro.PSObject.Copy();$bad.Parents=@(('1'*40),('2'*40));Assert-PostActivationSubjectIntroduction $bad "WORK_UNIT" "WU-POST-ACTIVATION" "RT-POST-ACTIVATION" "WU-POST-ACTIVATION" }
    Assert-Rejected "post-activation Work Unit introduction requires commit-scoped transition authority" { Assert-PostActivationSubjectIntroduction $postActivationIntro "WORK_UNIT" "WU-POST-ACTIVATION" "RT-POST-ACTIVATION" "WU-POST-ACTIVATION" }

    $mergeIntroRepo=Join-Path $fixtureRoot "status-merge-introduction-repo";$fixtureDirs+=$mergeIntroRepo;$null=&git -C $mergeIntroRepo init;$null=&git -C $mergeIntroRepo config user.email "fixture@xlb.invalid";$null=&git -C $mergeIntroRepo config user.name "XLB Fixture";[IO.File]::WriteAllText((Join-Path $mergeIntroRepo "base.txt"),"base",[Text.Encoding]::UTF8);$null=&git -C $mergeIntroRepo add base.txt;$null=&git -C $mergeIntroRepo commit -m "fixture merge intro base";$mergeIntroBase=(&git -C $mergeIntroRepo rev-parse HEAD).Trim();[IO.File]::WriteAllText((Join-Path $mergeIntroRepo "left.txt"),"left",[Text.Encoding]::UTF8);$null=&git -C $mergeIntroRepo add left.txt;$null=&git -C $mergeIntroRepo commit -m "fixture merge intro left";$mergeIntroLeft=(&git -C $mergeIntroRepo rev-parse HEAD).Trim();$null=&git -C $mergeIntroRepo checkout --detach $mergeIntroBase;[IO.File]::WriteAllText((Join-Path $mergeIntroRepo "right.txt"),"right",[Text.Encoding]::UTF8);$null=&git -C $mergeIntroRepo add right.txt;$null=&git -C $mergeIntroRepo commit -m "fixture merge intro right";$null=&git -C $mergeIntroRepo merge --no-ff --no-commit $mergeIntroLeft;if($LASTEXITCODE-ne0){throw"fixture merge-only subject preparation failed"};$mergeIntroManifestRef="governance/execution/work-units/WU-MERGE-INTRO.json";$mergeIntroManifestPath=Join-Path $mergeIntroRepo $mergeIntroManifestRef;$null=New-Item -ItemType Directory -Path (Split-Path $mergeIntroManifestPath) -Force;$mergeIntroManifest=[ordered]@{trainId="RT-MERGE-INTRO";workUnitId="WU-MERGE-INTRO";status="PLANNED";previousStatus="NONE";statusChangedAt="2026-07-14T06:10:00+08:00";transitionAuthorityRef="governance/execution/transitions/WU-MERGE-INTRO.json"};[IO.File]::WriteAllText($mergeIntroManifestPath,($mergeIntroManifest|ConvertTo-Json),[Text.Encoding]::UTF8);$null=&git -C $mergeIntroRepo add governance/execution/work-units/WU-MERGE-INTRO.json;$null=&git -C $mergeIntroRepo commit -m "fixture merge-only initial subject"
    Assert-Rejected "production initial subject introduced only by multi-parent merge" { Invoke-WithRepositoryRoot $mergeIntroRepo { Assert-StatusHistoryBinding $mergeIntroManifestRef "WORK_UNIT" "WU-MERGE-INTRO" "PLANNED" "NONE" "2026-07-14T06:10:00+08:00" "governance/execution/transitions/WU-MERGE-INTRO.json" "RT-MERGE-INTRO" "WU-MERGE-INTRO" } }

    $strictHistoryRepo=Join-Path $fixtureRoot "strict-record-history-repo";$fixtureDirs+=$strictHistoryRepo
    $strictTransitionDir=Join-Path $strictHistoryRepo "governance/execution/transitions";$strictEvidenceDir=Join-Path $strictHistoryRepo "governance/execution/evidence"
    $null=New-Item -ItemType Directory -Path $strictTransitionDir -Force;$null=New-Item -ItemType Directory -Path $strictEvidenceDir -Force
    $null=&git -C $strictHistoryRepo init;$null=&git -C $strictHistoryRepo config user.email "fixture@xlb.invalid";$null=&git -C $strictHistoryRepo config user.name "XLB Fixture"
    $strictTransitionRef="governance/execution/transitions/TRANSITION-IMMUTABLE-FIXTURE.json";$strictAuditRef="governance/execution/evidence/PACKAGE-AUDIT-IMMUTABLE-FIXTURE.json";$deleteReaddRef="governance/execution/transitions/TRANSITION-DELETE-READD-FIXTURE.json"
    $strictTransition=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-IMMUTABLE-FIXTURE";createdAt="2026-07-14T04:00:00+08:00";subjectType="WORK_UNIT";subjectId="WU-STRICT-FIXTURE";trainId="RT-STRICT-FIXTURE";workUnitId="WU-STRICT-FIXTURE";previousStatus="PACKAGE_VERIFIED";currentStatus="PACKAGE_AUDITED";changedAt="2026-07-14T04:00:00+08:00";scope="WORK_UNIT_AUDIT";decision="APPROVED";actorRole="Audit Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    $strictAudit=[ordered]@{schemaVersion=1;recordType="INDEPENDENT_AUDIT";recordId="PACKAGE-AUDIT-IMMUTABLE-FIXTURE";createdAt="2026-07-14T04:00:00+08:00";trainId="RT-STRICT-FIXTURE";workUnitId="WU-STRICT-FIXTURE";candidateCommit=('0'*40);candidateDigest=('0'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=('1'*40);contractRevision=('2'*40);environmentDigest=('3'*64);result="PASS";independentFromWriter=$true;evidenceRefs=@("governance/execution/evidence/EVIDENCE-FIXTURE.json");evidenceBindings=@();checks=@("PACKAGE_EVIDENCE_BOUND");actorRole="Audit Agent"}
    $deleteReaddRecord=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-DELETE-READD-FIXTURE";createdAt="2026-07-14T04:00:00+08:00";subjectType="WORK_UNIT";subjectId="WU-DELETE-READD-FIXTURE";trainId="RT-STRICT-FIXTURE";workUnitId="WU-DELETE-READD-FIXTURE";previousStatus="PLANNED";currentStatus="BLOCKED";changedAt="2026-07-14T04:00:00+08:00";scope="WORK_UNIT_EXECUTION_CONTROL";decision="APPROVED";actorRole="General Contractor Agent";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    $strictTransitionJson=$strictTransition|ConvertTo-Json -Depth 10;$strictAuditJson=$strictAudit|ConvertTo-Json -Depth 10;$deleteReaddJson=$deleteReaddRecord|ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictTransitionRef),$strictTransitionJson,[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictAuditRef),$strictAuditJson,[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $strictHistoryRepo $deleteReaddRef),$deleteReaddJson,[Text.Encoding]::UTF8)
    $null=&git -C $strictHistoryRepo add governance/execution;$null=&git -C $strictHistoryRepo commit -m "fixture introduce immutable strict records";if($LASTEXITCODE-ne0){throw"fixture strict record introduction failed"}
    [IO.File]::WriteAllText((Join-Path $strictHistoryRepo "governance/execution/UNRELATED.txt"),"unrelated commit after strict record introduction",[Text.Encoding]::UTF8);$null=&git -C $strictHistoryRepo add governance/execution/UNRELATED.txt;$null=&git -C $strictHistoryRepo commit -m "fixture unrelated strict record steady state"
    Invoke-WithRepositoryRoot $strictHistoryRepo { $null=Read-StrictRecord $strictTransitionRef "unchanged TRANSITION fixture" @("governance/execution/transitions");$null=Read-StrictRecord $strictAuditRef "unchanged package audit fixture" @("governance/execution/evidence");$null=Read-StrictRecord $deleteReaddRef "unchanged delete/readd fixture" @("governance/execution/transitions") }
    Write-Host "self-test accepted: strict records remain valid across unrelated commits"
    $strictTransition.checks=@("LEGAL_STATUS_EDGE_VERIFIED","TAMPERED_AFTER_INTRODUCTION");$strictAudit.result="FAIL"
    [IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictTransitionRef),($strictTransition|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictAuditRef),($strictAudit|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $strictHistoryRepo add governance/execution;$null=&git -C $strictHistoryRepo commit -m "fixture rewrite immutable strict records";if($LASTEXITCODE-ne0){throw"fixture strict record rewrite failed"}
    Assert-Rejected "production TRANSITION record rewrite after introduction" { Invoke-WithRepositoryRoot $strictHistoryRepo { $null=Read-StrictRecord $strictTransitionRef "immutable TRANSITION fixture" @("governance/execution/transitions") } }
    Assert-Rejected "production package independent audit rewrite after introduction" { Invoke-WithRepositoryRoot $strictHistoryRepo { $null=Read-StrictRecord $strictAuditRef "immutable package audit fixture" @("governance/execution/evidence") } }
    [IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictTransitionRef),$strictTransitionJson,[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $strictHistoryRepo $strictAuditRef),$strictAuditJson,[Text.Encoding]::UTF8);$null=&git -C $strictHistoryRepo add governance/execution;$null=&git -C $strictHistoryRepo commit -m "fixture restore strict record original bytes"
    Assert-Rejected "production TRANSITION rewrite then byte restoration remains historical tamper" { Invoke-WithRepositoryRoot $strictHistoryRepo { $null=Read-StrictRecord $strictTransitionRef "restored TRANSITION fixture" @("governance/execution/transitions") } }
    Remove-Item -LiteralPath (Join-Path $strictHistoryRepo $deleteReaddRef) -Force;$null=&git -C $strictHistoryRepo add -u -- $deleteReaddRef;$null=&git -C $strictHistoryRepo commit -m "fixture delete strict record"
    [IO.File]::WriteAllText((Join-Path $strictHistoryRepo $deleteReaddRef),$deleteReaddJson,[Text.Encoding]::UTF8);$null=&git -C $strictHistoryRepo add -- $deleteReaddRef;$null=&git -C $strictHistoryRepo commit -m "fixture readd strict record same bytes"
    Assert-Rejected "production strict record delete and re-add with same bytes" { Invoke-WithRepositoryRoot $strictHistoryRepo { $null=Read-StrictRecord $deleteReaddRef "delete/readd TRANSITION fixture" @("governance/execution/transitions") } }

    $validationPath=Join-Path $fixtureRoot "validation-authority.json";$fixtureFiles+=$validationPath
    $validationTrain=[ordered]@{trainId="RT-VALIDATION";status="VALIDATION_AUTHORIZED";previousStatus="PLANNED";statusChangedAt="2026-07-14T00:00:00+08:00";transitionAuthorityRef="governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md";executionMode="VALIDATION_ONLY";businessWriteAuthorized=$false;approvalRef="PENDING";runtimeCanaryAuthorized=$true;runtimeValidationApprovalRef="PENDING";runtimeValidationAuditRef="PENDING"}
    [IO.File]::WriteAllText($validationPath,($validationTrain|ConvertTo-Json),[Text.Encoding]::UTF8)
    Assert-Rejected "production VALIDATION_AUTHORIZED missing authority records" { $validation=Read-Json $validationPath "validation authority fixture";Assert-TrainAuthority $validation ([pscustomobject]@{auditedCandidateCommit=$head}) "ENABLED" "ENABLED" }
    $illegalTransitions=@{PLANNED=@("WAITING_DEPENDENCY","CONTRACT_FROZEN")}
    Assert-Rejected "production PLANNED direct to QUEUED transition" { Assert-StatusTransition "PLANNED" "QUEUED" $illegalTransitions "Work Unit fixture" "2026-07-14T00:00:00+08:00" "governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md" "WORK_UNIT" "WU-FIXTURE" "RT-FIXTURE" "WU-FIXTURE" }
    $plannedTransitions=@{NONE=@("PLANNED")}
    Assert-Rejected "production markdown transition authority" { Assert-StatusTransition "NONE" "PLANNED" $plannedTransitions "Work Unit markdown fixture" "2026-07-14T00:00:00+08:00" "governance/07_GOVERNANCE_EXECUTION_SYSTEM_IMPLANTATION_REPORT.md" "WORK_UNIT" "WU-FIXTURE" "RT-FIXTURE" "WU-FIXTURE" }
    $negativeHuman=[pscustomobject]@{recordType="HUMAN_CONFIRMATION";scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";confirmationCode="ENABLE_GOVERNANCE_EXECUTION";confirmationText="NOT APPROVED: ENABLE GOVERNANCE EXECUTION SYSTEM"}
    Assert-Rejected "production Human confirmation negation" { Assert-ExplicitHumanConfirmation $negativeHuman "HUMAN_CONFIRMATION" "GOVERNANCE_EXECUTION_ENABLEMENT" "ENABLE_GOVERNANCE_EXECUTION" "5ZCM5oSP5ZCv55So5rK755CG5omn6KGM57O757uf" "APPROVED: ENABLE GOVERNANCE EXECUTION SYSTEM" "fixture Human confirmation" }
    $wrongTransitionRole=[pscustomobject]@{actorRole="Audit Agent";scope="TRAIN_BUSINESS_CONSTRUCTION"}
    Assert-Rejected "production transition edge wrong actorRole" { Assert-TransitionPolicy $wrongTransitionRole "RELEASE_TRAIN" "DRAFT" "CHARTER_HUMAN_APPROVED" "fixture transition policy" }
    $wrongTransitionScope=[pscustomobject]@{actorRole="Human Owner";scope="TRAIN_EXECUTION_CONTROL"}
    Assert-Rejected "production transition edge wrong scope" { Assert-TransitionPolicy $wrongTransitionScope "RELEASE_TRAIN" "DRAFT" "CHARTER_HUMAN_APPROVED" "fixture transition policy" }
    $closedTrainFixture=[pscustomobject]@{trainId="RT-CLOSED-FIXTURE";status="CLOSED";executionMode="BUSINESS_CONSTRUCTION"}
    $nonterminalUnitFixture=[pscustomobject]@{TrainId="RT-CLOSED-FIXTURE";WorkUnitId="WU-NONTERMINAL";Status="QUEUED"}
    Assert-Rejected "production closed Train with non-terminal Work Unit" { Assert-TrainWorkUnitClosureConsistency @($closedTrainFixture) @($nonterminalUnitFixture) @() @() }
    $terminalUnitFixture=[pscustomobject]@{TrainId="RT-CLOSED-FIXTURE";WorkUnitId="WU-TERMINAL";Status="CLOSED"}
    $terminalLeaseFixture=[pscustomobject]@{TrainId="RT-CLOSED-FIXTURE";WorkUnitId="WU-TERMINAL";Id="LEASE-TERMINAL"}
    Assert-Rejected "production terminal Work Unit with active lease" { Assert-TrainWorkUnitClosureConsistency @($closedTrainFixture) @($terminalUnitFixture) @($terminalLeaseFixture) @() }
    $terminalReservationFixture=[pscustomobject]@{trainId="RT-CLOSED-FIXTURE";workUnitId="WU-TERMINAL";status="MATERIALIZED";number="058"}
    Assert-Rejected "production terminal Work Unit and Train with active migration reservation" { Assert-TrainWorkUnitClosureConsistency @($closedTrainFixture) @($terminalUnitFixture) @() @() @($terminalReservationFixture) }
    Assert-TrainWorkUnitClosureConsistency @($closedTrainFixture) @($terminalUnitFixture) @() @()
    $abandonedTrainFixture=[pscustomobject]@{trainId="RT-ABANDONED-FIXTURE";status="ABANDONED";executionMode="BUSINESS_CONSTRUCTION"};$abandonedPlannedUnit=[pscustomobject]@{TrainId="RT-ABANDONED-FIXTURE";WorkUnitId="WU-ABANDONED-PLANNED";Status="PLANNED"};$abandonedClosedUnit=[pscustomobject]@{TrainId="RT-ABANDONED-FIXTURE";WorkUnitId="WU-ABANDONED-CLOSED";Status="CLOSED"};$abandonedLease=[pscustomobject]@{trainId="RT-ABANDONED-FIXTURE";workUnitId="WU-ABANDONED-CLOSED";Id="LEASE-ABANDONED"};$abandonedQueue=[pscustomobject]@{trainId="RT-ABANDONED-FIXTURE";workUnitId="WU-ABANDONED-CLOSED";sequence=1};$abandonedReservation=[pscustomobject]@{trainId="RT-ABANDONED-FIXTURE";workUnitId="WU-ABANDONED-CLOSED";status="RESERVED";number="058"}
    Assert-Rejected "production ABANDONED Train with PLANNED Work Unit" {Assert-TrainWorkUnitClosureConsistency @($abandonedTrainFixture) @($abandonedPlannedUnit) @() @()};Assert-Rejected "production ABANDONED Train with active lease" {Assert-TrainWorkUnitClosureConsistency @($abandonedTrainFixture) @($abandonedClosedUnit) @($abandonedLease) @()};Assert-Rejected "production ABANDONED Train with queue item" {Assert-TrainWorkUnitClosureConsistency @($abandonedTrainFixture) @($abandonedClosedUnit) @() @($abandonedQueue)};Assert-Rejected "production ABANDONED Train with active reservation" {Assert-TrainWorkUnitClosureConsistency @($abandonedTrainFixture) @($abandonedClosedUnit) @() @() @($abandonedReservation)}
    Assert-Rejected "production CLOSED migration Work Unit cannot retain MATERIALIZED reservation" { Assert-PackageMigrationReservationStatus "CLOSED" "MATERIALIZED" "db/migrations/058_fixture.sql" }
    Assert-PackageMigrationReservationStatus "PACKAGE_AUDITED" "MATERIALIZED" "db/migrations/058_fixture.sql"
    Assert-PackageMigrationReservationStatus "CLOSED" "MERGED" "db/migrations/058_fixture.sql"
    Write-Host "self-test accepted: package-to-CLOSED migration reservation lifecycle"
    $closedEvidenceErasureFixture=[pscustomobject]@{TrainId="RT-CLOSED-FIXTURE";WorkUnitId="WU-TERMINAL";Status="CLOSED";Manifest=[pscustomobject]@{baseCommit=$head;contractRevision=$head;evidenceRefs=@();candidateRecordRef="PENDING";auditRefs=@()}}
    Assert-Rejected "production CLOSED Work Unit package evidence erasure" { Assert-PackageRecordBindings $closedEvidenceErasureFixture $head (Get-CandidateDigest $head) ('0'*64) $true }
    $writerAudit=[pscustomobject]@{recordType="INDEPENDENT_ENABLEMENT_AUDIT";scope="GOVERNANCE_EXECUTION_ENABLEMENT";result="PASS";independentFromWriter=$true;checks=@();actorRole="Writer"}
    Assert-Rejected "production self-declared independent audit" { Assert-IndependentAuditRecord $writerAudit "CANDIDATE_CONTENT_PREFLIGHT_PASS" "fixture independent audit" }

    $canonicalSource=$Root
    $sourceRegistry=Get-Content -Raw -Encoding UTF8 (Join-Path $canonicalSource "governance/execution/train-registry.json")|ConvertFrom-Json
    $sourceExecutionStatus=(Require-Text $sourceRegistry "executionSystemStatus" "self-test source Registry").ToUpperInvariant()
    $bootstrapSourceCommit=if($sourceExecutionStatus-in@("ENABLED","DISABLED")){
      Require-Text $sourceRegistry "auditedCandidateCommit" "self-test source Registry"
    }else{
      (&git -C $canonicalSource rev-parse HEAD).Trim()
    }
    if($bootstrapSourceCommit-notmatch'^[0-9a-fA-F]{40}$'-or(&git -C $canonicalSource cat-file -t $bootstrapSourceCommit 2>$null).Trim()-ne"commit"){
      throw"self-test Bootstrap source commit is not immutable: $bootstrapSourceCommit"
    }
    $bootstrapRegistry=(&git -C $canonicalSource show "$bootstrapSourceCommit`:governance/execution/train-registry.json"|Out-String|ConvertFrom-Json)
    if((Require-Text $bootstrapRegistry "executionSystemStatus" "self-test Bootstrap Registry")-ne"BOOTSTRAP"-or
       (Require-Text $bootstrapRegistry "enablementStatus" "self-test Bootstrap Registry")-ne"NOT_ENABLED"){
      throw"self-test Bootstrap source commit is not BOOTSTRAP/NOT_ENABLED: $bootstrapSourceCommit"
    }
    $repositoryFixture=Join-Path $fixtureRoot "repository-context";$fixtureDirs+=$repositoryFixture
    $savedErrorAction=$ErrorActionPreference;$ErrorActionPreference="Continue"
    try{
      $cloneOutput=@(& git clone --shared --no-checkout $canonicalSource $repositoryFixture 2>&1);$cloneExit=$LASTEXITCODE
      if($cloneExit-ne0){throw"repository fixture clone failed: $($cloneOutput-join' ')"}
      $checkoutOutput=@(& git -C $repositoryFixture checkout --detach $bootstrapSourceCommit 2>&1);$checkoutExit=$LASTEXITCODE
      if($checkoutExit-ne0){throw"repository fixture checkout failed: $($checkoutOutput-join' ')"}
    }finally{$ErrorActionPreference=$savedErrorAction}
    Copy-Item -LiteralPath (Join-Path $canonicalSource "scripts/check-managed-worktree-boundaries.ps1") -Destination (Join-Path $repositoryFixture "scripts/check-managed-worktree-boundaries.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $canonicalSource "scripts/test-managed-worktree-isolation.ps1") -Destination (Join-Path $repositoryFixture "scripts/test-managed-worktree-isolation.ps1") -Force
    $null=& git -C $repositoryFixture add governance/execution scripts/check-managed-worktree-boundaries.ps1 scripts/test-managed-worktree-isolation.ps1
    $null=& git -C $repositoryFixture diff --cached --quiet
    if($LASTEXITCODE-eq1){$null=& git -C $repositoryFixture commit -m "fixture governance candidate";if($LASTEXITCODE-ne0){throw"repository fixture baseline commit failed"}}
    elseif($LASTEXITCODE-ne0){throw"repository fixture staged diff check failed"}
    $fixtureBaseline=(& git -C $repositoryFixture rev-parse HEAD).Trim()
    $fixtureRegistryPath=Join-Path $repositoryFixture "governance/execution/train-registry.json";$fixtureQueuePath=Join-Path $repositoryFixture "governance/execution/integration-queue.json"

    $fixtureManifestPath=Join-Path $repositoryFixture "governance/execution/work-units/WU-GOV-VALIDATION-001-A.json"
    $fixtureManifest=Get-Content -Raw -Encoding UTF8 $fixtureManifestPath|ConvertFrom-Json
    foreach($missingField in @("targetPhase","role","dependencies","evidencePlan","auditRefs","createdAt","expiresOrClosesAt")){$fixtureManifest.PSObject.Properties.Remove($missingField)}
    [IO.File]::WriteAllText($fixtureManifestPath,($fixtureManifest|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository missing required Manifest governance fields" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout -- governance/execution/work-units/WU-GOV-VALIDATION-001-A.json

    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureBusinessTrain=@($fixtureRegistry.trains|Where-Object trainId -eq "RT-P30-P31-001")[0];$fixtureBusinessTrain.charterRef="governance/execution/README.md"
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository noncanonical business Charter" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout -- governance/execution/train-registry.json

    $fakeDisabledTime="2026-07-14T00:30:00+08:00";$fakeDisabledExecutionRef="governance/execution/transitions/TRANSITION-FAKE-DISABLED-EXECUTION.json";$fakeDisabledQueueRef="governance/execution/transitions/TRANSITION-FAKE-DISABLED-QUEUE.json"
    $fakeDisabledExecution=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-FAKE-DISABLED-EXECUTION";createdAt=$fakeDisabledTime;subjectType="EXECUTION_SYSTEM";subjectId="GLOBAL_EXECUTION_SYSTEM";previousStatus="ENABLED/ENABLED";currentStatus="DISABLED/DISABLED";changedAt=$fakeDisabledTime;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    $fakeDisabledQueue=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-FAKE-DISABLED-QUEUE";createdAt=$fakeDisabledTime;subjectType="INTEGRATION_QUEUE";subjectId="INTEGRATION_QUEUE";previousStatus="ENABLED";currentStatus="DISABLED";changedAt=$fakeDisabledTime;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $fakeDisabledExecutionRef),($fakeDisabledExecution|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $repositoryFixture $fakeDisabledQueueRef),($fakeDisabledQueue|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add -- $fakeDisabledExecutionRef $fakeDisabledQueueRef;$null=&git -C $repositoryFixture commit -m "fixture fake disable authorities";if($LASTEXITCODE-ne0){throw"fixture fake disable authority commit failed"}
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureQueue=Get-Content -Raw -Encoding UTF8 $fixtureQueuePath|ConvertFrom-Json
    $fixtureRegistry.executionSystemStatus="DISABLED";$fixtureRegistry.enablementStatus="DISABLED";$fixtureRegistry.previousExecutionSystemStatus="ENABLED";$fixtureRegistry.previousEnablementStatus="ENABLED";$fixtureRegistry.statusChangedAt=$fakeDisabledTime;$fixtureRegistry.transitionAuthorityRef=$fakeDisabledExecutionRef
    $fixtureQueue.executionSystemStatus="DISABLED";$fixtureQueue.enablementStatus="DISABLED";$fixtureQueue.previousEnablementStatus="ENABLED";$fixtureQueue.statusChangedAt=$fakeDisabledTime;$fixtureQueue.transitionAuthorityRef=$fakeDisabledQueueRef
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($fixtureQueuePath,($fixtureQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add governance/execution/train-registry.json governance/execution/integration-queue.json;$null=&git -C $repositoryFixture commit -m "fixture bootstrap fake disabled state";if($LASTEXITCODE-ne0){throw"fixture fake disabled state commit failed"}
    Assert-Rejected "full Repository cannot reach DISABLED without historical ENABLED ancestor" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=&git -C $repositoryFixture checkout $fixtureBaseline -- governance/execution/train-registry.json governance/execution/integration-queue.json;$null=&git -C $repositoryFixture commit -m "fixture restore bootstrap after fake disabled";if($LASTEXITCODE-ne0){throw"fixture bootstrap restore after fake disabled failed"}

    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureQueue=Get-Content -Raw -Encoding UTF8 $fixtureQueuePath|ConvertFrom-Json
    $fixtureRegistry.executionSystemStatus="ENABLED";$fixtureRegistry.enablementStatus="ENABLED";$fixtureRegistry.previousExecutionSystemStatus="BOOTSTRAP";$fixtureRegistry.previousEnablementStatus="NOT_ENABLED"
    $fixtureQueue.executionSystemStatus="ENABLED";$fixtureQueue.enablementStatus="ENABLED";$fixtureQueue.previousEnablementStatus="NOT_ENABLED"
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($fixtureQueuePath,($fixtureQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    $null=& git -C $repositoryFixture add governance/execution/train-registry.json governance/execution/integration-queue.json;$null=& git -C $repositoryFixture commit -m "fixture enabled pending authority";if($LASTEXITCODE-ne0){throw"fixture pending enablement commit failed"}
    Assert-Rejected "full Repository global enablement with PENDING authority" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout $fixtureBaseline -- governance/execution/train-registry.json governance/execution/integration-queue.json;$null=& git -C $repositoryFixture commit -m "fixture restore bootstrap controls";if($LASTEXITCODE-ne0){throw"fixture bootstrap restore commit failed"}

    $fixtureQueue=Get-Content -Raw -Encoding UTF8 $fixtureQueuePath|ConvertFrom-Json;$fixtureQueue.items=@([pscustomobject]@{sequence=1;trainId="RT";workUnitId="WU";status="QUEUED";cleanWorktree=$true;immutableCandidateCommit=$true;stale=$false;independentAuditStatus="PASS"})
    [IO.File]::WriteAllText($fixtureQueuePath,($fixtureQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository queue self-reported booleans" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout -- governance/execution/integration-queue.json

    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$validation=@($fixtureRegistry.trains|Where-Object trainId -eq "RT-GOV-VALIDATION-001")[0]
    $validation.status="VALIDATION_AUTHORIZED";$validation.previousStatus="PLANNED";$validation.runtimeCanaryAuthorized=$true
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository VALIDATION_AUTHORIZED closure" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout -- governance/execution/train-registry.json

    $fixtureShadow=Join-Path $repositoryFixture "db/migrations/024_shadow.sql";[IO.File]::WriteAllText($fixtureShadow,"-- full repository untracked fixture",[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository untracked locked migration" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    Remove-Item -LiteralPath $fixtureShadow -Force
    $fixtureNoncanonical=Join-Path $repositoryFixture "db/migrations/not-numbered.sql";[IO.File]::WriteAllText($fixtureNoncanonical,"-- noncanonical migration fixture",[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository noncanonical migration filename" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    Remove-Item -LiteralPath $fixtureNoncanonical -Force

    $fixtureReservationsPath=Join-Path $repositoryFixture "governance/execution/migration-reservations.json";$fixtureReservations=Get-Content -Raw -Encoding UTF8 $fixtureReservationsPath|ConvertFrom-Json;$fixtureReservations.reservations=@()
    [IO.File]::WriteAllText($fixtureReservationsPath,($fixtureReservations|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    Assert-Rejected "full Repository historical migration reservation deletion" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout -- governance/execution/migration-reservations.json

    $null=&git -C $repositoryFixture checkout --detach $fixtureBaseline;if($LASTEXITCODE-ne0){throw"fixture noncanonical history baseline restore failed"}
    $historicalBypassDirectory=Join-Path $repositoryFixture "db/migrations/archive";$null=New-Item -ItemType Directory -Path $historicalBypassDirectory -Force
    $historicalBypassPath=Join-Path $historicalBypassDirectory "058_deleted_bypass.SQL";[IO.File]::WriteAllText($historicalBypassPath,"-- deleted noncanonical migration history fixture",[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add db/migrations/archive/058_deleted_bypass.SQL;$null=&git -C $repositoryFixture commit -m "fixture introduce nested uppercase migration SQL";Remove-Item -LiteralPath $historicalBypassPath -Force;$null=&git -C $repositoryFixture add -u db/migrations;$null=&git -C $repositoryFixture commit -m "fixture delete nested uppercase migration SQL"
    $historicalLedger=Get-Content -Raw -Encoding UTF8 $fixtureReservationsPath|ConvertFrom-Json
    Assert-Rejected "full DAG rejects deleted nested uppercase 058 SQL history" { Invoke-WithRepositoryRoot $repositoryFixture { Assert-ReservationLedgerHistory @($historicalLedger.reservations) } }

    $null=&git -C $repositoryFixture checkout --detach $fixtureBaseline;if($LASTEXITCODE-ne0){throw"fixture lifecycle baseline restore failed"};$lifecycleLedgerPath=$fixtureReservationsPath;$lifecycleLedger=Get-Content -Raw -Encoding UTF8 $lifecycleLedgerPath|ConvertFrom-Json;$lifecycleReservation=[ordered]@{number="058";expectedFilename="058_lifecycle_bypass.sql";trainId="RT-GOV-VALIDATION-001";workUnitId="WU-GOV-VALIDATION-001-A";owner="Migration Owner";baseCommit="80921871baf8647b2d3b7c97f8c0fde2a88f9400";tables=@("fixture_lifecycle_table");semanticScope="fixture lifecycle bypass";status="RESERVED";createdAt="2026-07-14T07:00:00+08:00";closedAt=$null;reason="fixture lifecycle reservation"};$lifecycleLedger.reservations=@($lifecycleReservation);[IO.File]::WriteAllText($lifecycleLedgerPath,($lifecycleLedger|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $repositoryFixture add governance/execution/migration-reservations.json;$null=&git -C $repositoryFixture commit -m "fixture lifecycle reservation before SQL";$lifecycleSqlPath=Join-Path $repositoryFixture "db/migrations/058_lifecycle_bypass.sql";[IO.File]::WriteAllText($lifecycleSqlPath,"-- lifecycle bypass fixture",[Text.Encoding]::UTF8);$lifecycleReservation.status="MERGED";$lifecycleReservation.closedAt="2026-07-14T07:01:00+08:00";$lifecycleReservation.reason="fixture direct merge bypass";$lifecycleLedger.reservations=@($lifecycleReservation);[IO.File]::WriteAllText($lifecycleLedgerPath,($lifecycleLedger|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $repositoryFixture add db/migrations/058_lifecycle_bypass.sql governance/execution/migration-reservations.json;$null=&git -C $repositoryFixture commit -m "fixture PLANNED Work Unit direct SQL merge";Assert-Rejected "full Repository NOT_ENABLED DRAFT PLANNED direct migration merge bypass" {Invoke-WithRepositoryRoot $repositoryFixture {$null=Test-RepositoryGovernance}}
    $null=&git -C $repositoryFixture checkout --detach $fixtureBaseline;if($LASTEXITCODE-ne0){throw"fixture lifecycle restore before authority records failed"}

    $strictApprovalDir=Join-Path $repositoryFixture "governance/execution/approvals";if(-not(Test-Path $strictApprovalDir)){New-Item -ItemType Directory -Path $strictApprovalDir -Force|Out-Null}
    $missingIdentityRef="governance/execution/approvals/STRICT-MISSING-IDENTITY-FIXTURE.json";$invalidTimeRef="governance/execution/approvals/STRICT-INVALID-TIME-FIXTURE.json"
    $strictBase=[ordered]@{schemaVersion=1;recordType="HUMAN_CONFIRMATION";createdAt="2026-07-14T00:00:00+08:00";candidateCommit=('0'*40);candidateDigest=('0'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=('0'*40);decision="APPROVED";scope="GOVERNANCE_EXECUTION_ENABLEMENT";confirmationCode="ENABLE_GOVERNANCE_EXECUTION";confirmationText="fixture";actorRole="Human Owner"}
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $missingIdentityRef),($strictBase|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $invalidTimeRecord=[ordered]@{};foreach($property in $strictBase.GetEnumerator()){$invalidTimeRecord[$property.Key]=$property.Value};$invalidTimeRecord.recordId="STRICT-INVALID-TIME";$invalidTimeRecord.createdAt="2026-07-14 00:00:00"
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $invalidTimeRef),($invalidTimeRecord|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add -- $missingIdentityRef $invalidTimeRef;$null=&git -C $repositoryFixture commit -m "fixture tracked invalid strict authority records"
    Assert-Rejected "full Repository tracked authority record missing recordId" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Read-StrictRecord $missingIdentityRef "tracked missing identity fixture" @("governance/execution/approvals") } }
    Assert-Rejected "full Repository tracked authority record invalid createdAt" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Read-StrictRecord $invalidTimeRef "tracked invalid time fixture" @("governance/execution/approvals") } }
    # The invalid-record checks are negative fixtures only; restore the clean
    # governance baseline before constructing the subsequent authority chain.
    $null=&git -C $repositoryFixture checkout --detach $fixtureBaseline;if($LASTEXITCODE-ne0){throw"fixture invalid strict-record cleanup failed"}

    # Enabled/disabled authority-chain positives use an independent fixture
    # repository.  They must never share the NOT_ENABLED negative-fixture DAG,
    # because a temporary enablement followed by a checkout/revert would make
    # global execution closure history appear to have been restored.
    $enabledRepositoryFixture=Join-Path $fixtureRoot "repository-enabled-context";$fixtureDirs+=$enabledRepositoryFixture
    $savedEnabledErrorAction=$ErrorActionPreference;$ErrorActionPreference="Continue";try{$cloneOutput=@(& git clone --quiet --shared --no-checkout $canonicalSource $enabledRepositoryFixture 2>&1);$cloneExit=$LASTEXITCODE}finally{$ErrorActionPreference=$savedEnabledErrorAction};if($cloneExit-ne0){throw"enabled repository fixture clone failed: $($cloneOutput-join' ')"}
    $null=& git -C $enabledRepositoryFixture checkout --detach $bootstrapSourceCommit;if($LASTEXITCODE-ne0){throw"enabled repository fixture Bootstrap checkout failed"}
    Copy-Item -LiteralPath (Join-Path $canonicalSource "scripts/check-managed-worktree-boundaries.ps1") -Destination (Join-Path $enabledRepositoryFixture "scripts/check-managed-worktree-boundaries.ps1") -Force;Copy-Item -LiteralPath (Join-Path $canonicalSource "scripts/test-managed-worktree-isolation.ps1") -Destination (Join-Path $enabledRepositoryFixture "scripts/test-managed-worktree-isolation.ps1") -Force
    $null=&git -C $enabledRepositoryFixture add governance scripts/check-managed-worktree-boundaries.ps1 scripts/test-managed-worktree-isolation.ps1;$null=&git -C $enabledRepositoryFixture diff --cached --quiet;if($LASTEXITCODE-eq1){$null=&git -C $enabledRepositoryFixture commit -m "fixture enabled repository governance baseline";if($LASTEXITCODE-ne0){throw"enabled repository fixture baseline commit failed"}}
    $repositoryFixture=$enabledRepositoryFixture;$fixtureBaseline=(&git -C $repositoryFixture rev-parse HEAD).Trim();$fixtureRegistryPath=Join-Path $repositoryFixture "governance/execution/train-registry.json";$fixtureQueuePath=Join-Path $repositoryFixture "governance/execution/integration-queue.json"

    $snapshotProbeManifest=Join-Path $repositoryFixture "governance/execution/work-units/UNTRACKED-SNAPSHOT-BYPASS.json";$snapshotProbeMigration=Join-Path $repositoryFixture "db/migrations/058_untracked_snapshot_bypass.sql"
    [IO.File]::WriteAllText($fixtureRegistryPath,"{ invalid live registry",[Text.Encoding]::UTF8);[IO.File]::WriteAllText($snapshotProbeManifest,"{ invalid live manifest",[Text.Encoding]::UTF8);[IO.File]::WriteAllText($snapshotProbeMigration,"-- untracked live migration",[Text.Encoding]::UTF8)
    $savedControlCommit=$script:ControlCommit
    try{
      $script:ControlCommit=$fixtureBaseline
      Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance }
      Write-Host "self-test accepted: immutable Repository snapshot ignores concurrent live canonical tamper"
      $script:ControlCommit="HEAD"
      $liveGateOut=Join-Path $fixtureRoot "live-gate-rejection.out";$liveGateErr=Join-Path $fixtureRoot "live-gate-rejection.err"
      $liveGate=Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-Mode','Repository','-RepositoryRoot',$repositoryFixture) -RedirectStandardOutput $liveGateOut -RedirectStandardError $liveGateErr -Wait -PassThru -WindowStyle Hidden
      if($liveGate.ExitCode-eq0){throw "[managed-worktree] SELF-TEST FAIL expected rejection: ordinary Repository Gate rejects the same live canonical tamper"}
      Write-Host "self-test rejected: ordinary Repository Gate rejects the same live canonical tamper";$script:SelfTestPassed++
    }finally{
      $script:ControlCommit=$savedControlCommit
      $null=&git -C $repositoryFixture checkout -- governance/execution/train-registry.json
      foreach($probe in @($snapshotProbeManifest,$snapshotProbeMigration)){if(Test-Path -LiteralPath $probe){Remove-Item -LiteralPath $probe -Force}}
    }

    $null=&git -C $repositoryFixture commit --allow-empty -m "fixture audited candidate C without status-path changes";if($LASTEXITCODE-ne0){throw"enabled fixture synthetic C commit failed"}
    $auditedCandidate=(& git -C $repositoryFixture rev-parse HEAD).Trim()
    $auditedDigest=Invoke-WithRepositoryRoot $repositoryFixture { Get-CandidateDigest $auditedCandidate }
    $approvalRef="governance/execution/approvals/ENABLEMENT-FIXTURE.json";$auditRef="governance/execution/evidence/ENABLEMENT-AUDIT-FIXTURE.json";$humanRef="governance/execution/approvals/HUMAN-ENABLEMENT-FIXTURE.json"
    $executionTransitionRef="governance/execution/transitions/TRANSITION-EXECUTION-ENABLED-FIXTURE.json";$queueTransitionRef="governance/execution/transitions/TRANSITION-QUEUE-ENABLED-FIXTURE.json"
    foreach($directory in @((Join-Path $repositoryFixture "governance/execution/approvals"),(Join-Path $repositoryFixture "governance/execution/evidence"),(Join-Path $repositoryFixture "governance/execution/transitions"))){if(-not(Test-Path -LiteralPath $directory)){New-Item -ItemType Directory -Path $directory -Force|Out-Null}}
    $base="80921871baf8647b2d3b7c97f8c0fde2a88f9400";$timestamp="2026-07-14T00:00:00+08:00"
    $approvalRecord=[ordered]@{schemaVersion=1;recordType="ENABLEMENT_APPROVAL";recordId="ENABLEMENT-FIXTURE";createdAt=$timestamp;candidateCommit=$auditedCandidate;candidateDigest=$auditedDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$base;decision="APPROVED";scope="GOVERNANCE_EXECUTION_ENABLEMENT";auditRef=$auditRef;humanConfirmationRef=$humanRef;actorRole="Governance Gate"}
    $auditRecord=[ordered]@{schemaVersion=1;recordType="INDEPENDENT_ENABLEMENT_AUDIT";recordId="ENABLEMENT-AUDIT-FIXTURE";createdAt=$timestamp;candidateCommit=$auditedCandidate;candidateDigest=$auditedDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$base;result="PASS";scope="GOVERNANCE_EXECUTION_ENABLEMENT";independentFromWriter=$true;checks=@("CANDIDATE_CONTENT_PREFLIGHT_PASS");actorRole="Audit Agent"}
    $humanRecord=[ordered]@{schemaVersion=1;recordType="HUMAN_CONFIRMATION";recordId="HUMAN-ENABLEMENT-FIXTURE";createdAt=$timestamp;candidateCommit=$auditedCandidate;candidateDigest=$auditedDigest;candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=$base;decision="APPROVED";scope="GOVERNANCE_EXECUTION_ENABLEMENT";confirmationCode="ENABLE_GOVERNANCE_EXECUTION";confirmationText=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("5ZCM5oSP5ZCv55So5rK755CG5omn6KGM57O757uf")));actorRole="Human Owner"}
    $executionTransitionRecord=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-EXECUTION-ENABLED-FIXTURE";createdAt=$timestamp;subjectType="EXECUTION_SYSTEM";subjectId="GLOBAL_EXECUTION_SYSTEM";previousStatus="BOOTSTRAP/NOT_ENABLED";currentStatus="ENABLED/ENABLED";changedAt=$timestamp;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    $queueTransitionRecord=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-QUEUE-ENABLED-FIXTURE";createdAt=$timestamp;subjectType="INTEGRATION_QUEUE";subjectId="INTEGRATION_QUEUE";previousStatus="NOT_ENABLED";currentStatus="ENABLED";changedAt=$timestamp;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    foreach($recordWrite in @(
      [pscustomobject]@{Ref=$approvalRef;Record=$approvalRecord},[pscustomobject]@{Ref=$auditRef;Record=$auditRecord},[pscustomobject]@{Ref=$humanRef;Record=$humanRecord},
      [pscustomobject]@{Ref=$executionTransitionRef;Record=$executionTransitionRecord},[pscustomobject]@{Ref=$queueTransitionRef;Record=$queueTransitionRecord}
    )){[IO.File]::WriteAllText((Join-Path $repositoryFixture $recordWrite.Ref),($recordWrite.Record|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)}
    $null=& git -C $repositoryFixture add -- $approvalRef $auditRef $humanRef $executionTransitionRef $queueTransitionRef;$null=& git -C $repositoryFixture commit -m "fixture immutable authority envelope";if($LASTEXITCODE-ne0){throw"repository fixture authority envelope commit failed"}
    $authorityEnvelope=(& git -C $repositoryFixture rev-parse HEAD).Trim()
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureRegistry.executionSystemStatus="ENABLED";$fixtureRegistry.enablementStatus="ENABLED";$fixtureRegistry.previousExecutionSystemStatus="BOOTSTRAP";$fixtureRegistry.previousEnablementStatus="NOT_ENABLED";$fixtureRegistry.transitionAuthorityRef=$executionTransitionRef;$fixtureRegistry.enablementApprovalRef=$approvalRef;$fixtureRegistry.auditedCandidateCommit=$auditedCandidate;$fixtureRegistry.independentAuditRef=$auditRef;$fixtureRegistry.humanConfirmationRef=$humanRef;$fixtureRegistry.authorityEnvelopeCommit=$authorityEnvelope;$fixtureRegistry.enablementApprovalDigest=Get-CanonicalRecordDigest $approvalRecord;$fixtureRegistry.independentAuditDigest=Get-CanonicalRecordDigest $auditRecord;$fixtureRegistry.humanConfirmationDigest=Get-CanonicalRecordDigest $humanRecord
    $fixtureQueue=Get-Content -Raw -Encoding UTF8 $fixtureQueuePath|ConvertFrom-Json;$fixtureQueue.executionSystemStatus="ENABLED";$fixtureQueue.enablementStatus="ENABLED";$fixtureQueue.previousEnablementStatus="NOT_ENABLED";$fixtureQueue.transitionAuthorityRef=$queueTransitionRef
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($fixtureQueuePath,($fixtureQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    $null=& git -C $repositoryFixture add governance/execution/train-registry.json governance/execution/integration-queue.json;$null=& git -C $repositoryFixture commit -m "fixture enablement status switch";if($LASTEXITCODE-ne0){throw"repository fixture enablement switch commit failed"}
    Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance }
    Write-Host "self-test accepted: full Repository immutable enablement authority chain"
    $steadyStateRef="governance/execution/evidence/STEADY-STATE-FIXTURE.md";$steadyStatePath=Join-Path $repositoryFixture $steadyStateRef
    [IO.File]::WriteAllText($steadyStatePath,"steady-state evidence commit after enablement",[Text.Encoding]::UTF8)
    $null=& git -C $repositoryFixture add -- $steadyStateRef;$null=& git -C $repositoryFixture commit -m "fixture legal enabled steady-state evidence";if($LASTEXITCODE-ne0){throw"repository fixture steady-state commit failed"}
    Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance }
    Write-Host "self-test accepted: full Repository enabled steady-state commit"
    $enabledFixtureCommit=(& git -C $repositoryFixture rev-parse HEAD).Trim()
    $disabledTime="2026-07-14T00:45:00+08:00";$disabledExecutionRef="governance/execution/transitions/TRANSITION-EXECUTION-DISABLED-FIXTURE.json";$disabledQueueRef="governance/execution/transitions/TRANSITION-QUEUE-DISABLED-FIXTURE.json"
    $disabledExecution=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-EXECUTION-DISABLED-FIXTURE";createdAt=$disabledTime;subjectType="EXECUTION_SYSTEM";subjectId="GLOBAL_EXECUTION_SYSTEM";previousStatus="ENABLED/ENABLED";currentStatus="DISABLED/DISABLED";changedAt=$disabledTime;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    $disabledQueue=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-QUEUE-DISABLED-FIXTURE";createdAt=$disabledTime;subjectType="INTEGRATION_QUEUE";subjectId="INTEGRATION_QUEUE";previousStatus="ENABLED";currentStatus="DISABLED";changedAt=$disabledTime;scope="GOVERNANCE_EXECUTION_ENABLEMENT";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $disabledExecutionRef),($disabledExecution|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8);[IO.File]::WriteAllText((Join-Path $repositoryFixture $disabledQueueRef),($disabledQueue|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add -- $disabledExecutionRef $disabledQueueRef;$null=&git -C $repositoryFixture commit -m "fixture immutable disable authorities";if($LASTEXITCODE-ne0){throw"repository fixture disable authority commit failed"}
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureQueue=Get-Content -Raw -Encoding UTF8 $fixtureQueuePath|ConvertFrom-Json
    $fixtureRegistry.executionSystemStatus="DISABLED";$fixtureRegistry.enablementStatus="DISABLED";$fixtureRegistry.previousExecutionSystemStatus="ENABLED";$fixtureRegistry.previousEnablementStatus="ENABLED";$fixtureRegistry.statusChangedAt=$disabledTime;$fixtureRegistry.transitionAuthorityRef=$disabledExecutionRef
    $fixtureQueue.executionSystemStatus="DISABLED";$fixtureQueue.enablementStatus="DISABLED";$fixtureQueue.previousEnablementStatus="ENABLED";$fixtureQueue.statusChangedAt=$disabledTime;$fixtureQueue.transitionAuthorityRef=$disabledQueueRef
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);[IO.File]::WriteAllText($fixtureQueuePath,($fixtureQueue|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add governance/execution/train-registry.json governance/execution/integration-queue.json;$null=&git -C $repositoryFixture commit -m "fixture enabled to disabled transition";if($LASTEXITCODE-ne0){throw"repository fixture disable transition commit failed"}
    Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance }
    Write-Host "self-test accepted: full Repository ENABLED to DISABLED retains immutable enablement anchors"
    $disabledFixtureCommit=(&git -C $repositoryFixture rev-parse HEAD).Trim()
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureRegistry.enablementApprovalRef="PENDING";$fixtureRegistry.enablementApprovalDigest="PENDING"
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $repositoryFixture add governance/execution/train-registry.json;$null=&git -C $repositoryFixture commit -m "fixture disabled state anchor wipe";if($LASTEXITCODE-ne0){throw"repository fixture disabled anchor wipe commit failed"}
    Assert-Rejected "full Repository DISABLED state cannot wipe permanent enablement anchors" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=&git -C $repositoryFixture checkout --detach $enabledFixtureCommit;if($LASTEXITCODE-ne0){throw"fixture enabled state restore after disabled tests failed"}
    $falseHistoryRef="governance/execution/transitions/TRANSITION-FALSE-HISTORY-FIXTURE.json";$falseHistoryTime="2026-07-14T01:00:00+08:00"
    $falseHistoryRecord=[ordered]@{schemaVersion=1;recordType="TRANSITION";recordId="TRANSITION-FALSE-HISTORY-FIXTURE";createdAt=$falseHistoryTime;subjectType="RELEASE_TRAIN";subjectId="RT-P30-P31-001";trainId="RT-P30-P31-001";previousStatus="PLANNED";currentStatus="BLOCKED";changedAt=$falseHistoryTime;scope="TRAIN_EXECUTION_CONTROL";decision="APPROVED";actorRole="Human Owner";checks=@("LEGAL_STATUS_EDGE_VERIFIED")}
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $falseHistoryRef),($falseHistoryRecord|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$falseHistoryTrain=@($fixtureRegistry.trains|Where-Object trainId -eq "RT-P30-P31-001")[0];$falseHistoryTrain.status="BLOCKED";$falseHistoryTrain.previousStatus="PLANNED";$falseHistoryTrain.statusChangedAt=$falseHistoryTime;$falseHistoryTrain.transitionAuthorityRef=$falseHistoryRef
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=&git -C $repositoryFixture add -- governance/execution/train-registry.json $falseHistoryRef;$null=&git -C $repositoryFixture commit -m "fixture false previousStatus self-report"
    Assert-Rejected "full Repository previousStatus differs from immutable history" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=&git -C $repositoryFixture checkout --detach $enabledFixtureCommit;if($LASTEXITCODE-ne0){throw"fixture enabled steady-state restore failed"}
    $auditRecord.recordId="TAMPERED-AUDIT-IDENTITY";$auditRecord.checks=@("CANDIDATE_CONTENT_PREFLIGHT_PASS","TAMPERED_EXTRA_CHECK")
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $auditRef),($auditRecord|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=& git -C $repositoryFixture add -- $auditRef;$null=& git -C $repositoryFixture commit -m "fixture post-envelope audit record tamper";if($LASTEXITCODE-ne0){throw"repository fixture audit tamper commit failed"}
    Assert-Rejected "full Repository authority record changed after immutable envelope" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
    $null=& git -C $repositoryFixture checkout --detach $enabledFixtureCommit;if($LASTEXITCODE-ne0){throw"fixture enabled commit checkout failed"}
    $fixtureRegistry=Get-Content -Raw -Encoding UTF8 $fixtureRegistryPath|ConvertFrom-Json;$fixtureRegistry.enablementApprovalDigest=('0'*64)
    [IO.File]::WriteAllText($fixtureRegistryPath,($fixtureRegistry|ConvertTo-Json -Depth 20),[Text.Encoding]::UTF8);$null=& git -C $repositoryFixture add governance/execution/train-registry.json;$null=& git -C $repositoryFixture commit -m "fixture post-audit registry tamper";if($LASTEXITCODE-ne0){throw"repository fixture post-audit tamper commit failed"}
    Assert-Rejected "full Repository immutable enablement anchor tamper" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Test-RepositoryGovernance } }
  }
  finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
      $resolvedFixture=[IO.Path]::GetFullPath($fixtureRoot)
      if (-not $resolvedFixture.StartsWith($tempRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw "refusing fixture cleanup outside temp root: $resolvedFixture" }
      Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
    }
  }
  $scriptText = Get-Content -LiteralPath $PSCommandPath -Raw -Encoding UTF8
  if ([regex]::Matches($scriptText, '"--no-renames"').Count -lt 4) { throw "[managed-worktree] SELF-TEST FAIL production diff paths are not rename-safe" }
  Write-Output "check-managed-worktree-boundaries: SelfTest passed ($script:SelfTestPassed negative fixtures)"
}

if ($Mode -eq "SelfTest") { Invoke-NegativeSelfTests; return }
$repositoryState = Test-RepositoryGovernance
if ($Mode -eq "WorkUnit") { Test-WorkUnitBoundary $repositoryState }
