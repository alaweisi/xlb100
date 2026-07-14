param(
  [ValidateSet("Repository", "WorkUnit", "SelfTest")]
  [string]$Mode = "Repository",
  [string]$ManifestPath,
  [string]$WorktreePath,
  [string]$TargetRef = "HEAD"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
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

function Fail([string]$Message) {
  throw "[managed-worktree] FAIL $Message"
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
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "missing $Label at $Path"
  }
  try {
    $text = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    Assert-NoDuplicateJsonKeys $text $Label
    return $text | ConvertFrom-Json
  } catch {
    Fail "$Label is not valid JSON: $Path ($($_.Exception.Message))"
  }
}

function Read-GitJson([string]$Commit, [string]$RepoPath, [string]$Label) {
  $normalized = Normalize-RepoPath $RepoPath $Label
  $output = @(& git -C $Root show "$Commit`:$normalized" 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "$Label is missing from immutable commit $Commit`: $normalized" }
  try {
    $text = $output -join "`n"
    Assert-NoDuplicateJsonKeys $text $Label
    return $text | ConvertFrom-Json
  } catch {
    Fail "$Label is not valid JSON in immutable commit $Commit`: $normalized ($($_.Exception.Message))"
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

function Assert-StatusHistoryBinding([string]$RepoPath,[string]$SubjectType,[string]$SubjectId,[string]$Current,[string]$Previous,[string]$ChangedAt,[string]$AuthorityRef,[string]$TrainId="",[string]$WorkUnitId="",[string]$BaselineCommit="",[string[]]$SameStatusClosureFields=@(),[string[]]$CarryForwardFields=@()) {
  $normalized=Normalize-RepoPath $RepoPath "status history path"
  $commits=@(Invoke-Git $Root @("log","--format=%H","--",$normalized))
  if($commits.Count-eq0){Fail "$SubjectType $SubjectId has no immutable file history"}
  $currentSnapshot=Get-HistoryStatusSubject (Read-GitJson "HEAD" $normalized "current status history closure") $SubjectType $SubjectId $TrainId $WorkUnitId
  if($null-eq$currentSnapshot){Fail "$SubjectType $SubjectId is missing from current immutable history"}
  $sawCurrent=$false
  foreach($commit in $commits){
    &git -C $Root cat-file -e "$commit`:$normalized" 2>$null
    $snapshot=$null
    if($LASTEXITCODE-eq0){$snapshot=Get-HistoryStatusSubject (Read-GitJson $commit $normalized "status history") $SubjectType $SubjectId $TrainId $WorkUnitId}
    if($null-ne$snapshot-and"$($snapshot.Status)"-eq$Current){
      $sawCurrent=$true
      if("$($snapshot.Previous)"-ne$Previous-or"$($snapshot.ChangedAt)"-ne$ChangedAt-or"$($snapshot.AuthorityRef)"-ne$AuthorityRef){Fail "$SubjectType $SubjectId transition metadata changed while status remained $Current"}
      foreach($field in $SameStatusClosureFields){if((ConvertTo-CanonicalJsonText (Get-OptionalValue $snapshot.Subject $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $currentSnapshot.Subject $field))){Fail "$SubjectType $SubjectId immutable $Current closure field $field was replaced without a status transition"}}
      if(-not[string]::IsNullOrWhiteSpace($BaselineCommit)){
        &git -C $Root merge-base --is-ancestor $commit $BaselineCommit *> $null
        if($LASTEXITCODE-eq0){return}
      }
      continue
    }
    if(-not$sawCurrent){Fail "$SubjectType $SubjectId current worktree status is not byte-bound to HEAD history"}
    $actualPrevious=if($null-eq$snapshot){"NONE"}else{"$($snapshot.Status)"}
    if($actualPrevious-ne$Previous){Fail "$SubjectType $SubjectId previousStatus self-report differs from immutable history: declared $Previous, actual $actualPrevious"}
    if($null-ne$snapshot){foreach($field in $CarryForwardFields){if((ConvertTo-CanonicalJsonText (Get-OptionalValue $snapshot.Subject $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $currentSnapshot.Subject $field))){Fail "$SubjectType $SubjectId transition $Previous -> $Current replaced carry-forward closure field $field"}}}
    return
  }
  if(-not$sawCurrent-or$Previous-ne"NONE"){Fail "$SubjectType $SubjectId initial history requires previousStatus=NONE"}
}

function Assert-QueueItemHistoryBinding($Item,$Record,[int]$Sequence,[string]$BaselineCommit) {
  $queuePath="governance/execution/integration-queue.json";$manifestPath=$Record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
  $trainId=Require-Text $Item "trainId" "Queue history item";$workUnitId=Require-Text $Item "workUnitId" "Queue history item"
  $previous=Require-Text $Item "previousStatus" "Queue history item";$changedAt=Require-Text $Item "statusChangedAt" "Queue history item";$authorityRef=Require-Text $Item "transitionAuthorityRef" "Queue history item"
  $queueClosureFields=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","contractRevision","environmentDigest","candidateRecordRef","evidenceRefs","auditRefs","evidenceBindings","auditBindings")
  $introductionCommit=""
  foreach($commit in @(Invoke-Git $Root @("log","--format=%H","--",$queuePath))){
    $queueAtCommit=Read-GitJson $commit $queuePath "Queue item history"
    $historical=@($queueAtCommit.items|Where-Object{"$($_.trainId)"-eq$trainId-and"$($_.workUnitId)"-eq$workUnitId-and[int]$_.sequence-eq$Sequence})|Select-Object -First 1
    if($null-ne$historical){
      if((Require-Text $historical "previousStatus" "Queue item history")-ne$previous-or(Require-Text $historical "statusChangedAt" "Queue item history")-ne$changedAt-or(Require-Text $historical "transitionAuthorityRef" "Queue item history")-ne$authorityRef){Fail "Queue item $Sequence transition metadata changed after introduction"}
      foreach($field in $queueClosureFields){if((ConvertTo-CanonicalJsonText (Get-OptionalValue $historical $field))-cne(ConvertTo-CanonicalJsonText (Get-OptionalValue $Item $field))){Fail "Queue item $Sequence immutable package closure field $field changed after introduction"}}
      $introductionCommit="$commit"
      if(-not[string]::IsNullOrWhiteSpace($BaselineCommit)){&git -C $Root merge-base --is-ancestor $commit $BaselineCommit *> $null;if($LASTEXITCODE-eq0){return}}
      continue
    }
    if(-not[string]::IsNullOrWhiteSpace($introductionCommit)){break}
  }
  if([string]::IsNullOrWhiteSpace($introductionCommit)){Fail "Queue item $Sequence has no immutable introduction commit"}
  $introLine=(Invoke-Git $Root @("rev-list","--parents","-n","1",$introductionCommit)|Select-Object -First 1).Trim()-split'\s+'
  if($introLine.Count-ne2){Fail "Queue item $Sequence introduction must be a single-parent commit"}
  $parent=$introLine[1];&git -C $Root cat-file -e "$parent`:$manifestPath" 2>$null
  $actualPrevious=if($LASTEXITCODE-eq0){Require-Text (Read-GitJson $parent $manifestPath "Queue item parent Manifest") "status" "Queue item parent Manifest"}else{"NONE"}
  if($actualPrevious-ne$previous){Fail "Queue item $Sequence previousStatus differs from its Work Unit status in the immutable parent: declared $previous, actual $actualPrevious"}
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
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { Fail "$Label is missing: $normalized" }
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

function Assert-TransitionAuthorityRecord([string]$AuthorityRef, [string]$SubjectType, [string]$SubjectId, [string]$Previous, [string]$Current, [string]$ChangedAt, [string]$Label, [string]$TrainId = "", [string]$WorkUnitId = "") {
  $parsed = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse($ChangedAt, [ref]$parsed)) { Fail "$Label statusChangedAt is not an ISO timestamp" }
  $entry = Read-StrictRecord $AuthorityRef "$Label transitionAuthorityRef" @("governance/execution/transitions")
  $record = $entry.Record
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
  if ($normalized -notmatch '\.json$') { Fail "$Label must be a strict JSON record: $normalized" }
  $record = Read-Json (Join-Path $Root $normalized) $Label
  $recordType = (Require-Text $record "recordType" $Label).ToUpperInvariant()
  $common = @("schemaVersion","recordType","recordId","createdAt")
  $typeFields = switch ($recordType) {
    "ENABLEMENT_APPROVAL" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","decision","scope","auditRef","humanConfirmationRef","actorRole") }
    "INDEPENDENT_ENABLEMENT_AUDIT" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","result","scope","independentFromWriter","checks","actorRole") }
    "HUMAN_CONFIRMATION" { @("candidateCommit","candidateDigest","candidateDigestAlgorithm","baseCommit","decision","scope","confirmationCode","confirmationText","actorRole") }
    "TRAIN_BUSINESS_APPROVAL" { @("trainId","baseCommit","charterRef","charterDigest","decision","scope","confirmationCode","confirmationText","actorRole") }
    "RUNTIME_VALIDATION_APPROVAL" { @("trainId","candidateCommit","candidateDigest","candidateDigestAlgorithm","decision","scope","confirmationCode","confirmationText","actorRole") }
    "INDEPENDENT_RUNTIME_SAFETY_AUDIT" { @("trainId","candidateCommit","candidateDigest","candidateDigestAlgorithm","result","scope","independentFromWriter","checks","actorRole") }
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
  return $entry
}

function Assert-RecordImmutableSinceIntroduction($Entry,[string]$Label) {
  $commits=@(Invoke-Git $Root @("rev-list","HEAD","--full-history","--",$Entry.Ref))
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
  if ($null -eq $member -or $null -eq $member.Value -or $member.Value -isnot [System.Array]) { Fail "$Label is missing required array field '$Property'" }
  $values = @($member.Value)
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
    "executionMode","worktreePath","branch","baseCommit","baseTag","dependencies","allowedPaths","forbiddenPaths","semanticOwnership",
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
    Assert-AllowedFields $leaseRefs @("worktreePath","sourcePath","environment","ports") "$Label leaseRefs"
    $ports = Get-OptionalValue $leaseRefs "ports"
    if ($null -ne $ports) { Assert-AllowedFields $ports @("mysql","redis","backend","customer","worker","admin") "$Label leaseRefs.ports" }
  }
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
  & git -C $Root merge-base --is-ancestor $candidate HEAD *> $null
  if ($LASTEXITCODE -ne 0) { Fail "auditedCandidateCommit must be an ancestor of the enablement HEAD" }
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
  & git -C $Root merge-base --is-ancestor $envelope HEAD *> $null
  if ($LASTEXITCODE -ne 0) { Fail "authorityEnvelopeCommit must be an ancestor of the enablement HEAD" }
  $postEnvelopeFirstParent = @(Invoke-Git $Root @("rev-list","--first-parent","--reverse","$envelope..HEAD"))
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
  $transitions = @{
    NONE=@("PLANNED","DRAFT"); PLANNED=@("VALIDATION_AUTHORIZED","BLOCKED","ABANDONED");
    DRAFT=@("CHARTER_HUMAN_APPROVED","BLOCKED","ABANDONED"); CHARTER_HUMAN_APPROVED=@("ASSEMBLING","BLOCKED","ABANDONED");
    VALIDATION_AUTHORIZED=@("TRAIN_VERIFIED","BLOCKED","ABANDONED"); ASSEMBLING=@("TRAIN_VERIFIED","BLOCKED");
    TRAIN_VERIFIED=@("HUMAN_ACCEPTED","BLOCKED"); HUMAN_ACCEPTED=@("PHASE_LOCKS_COMPLETED");
    PHASE_LOCKS_COMPLETED=@("CLOSED"); BLOCKED=@("PLANNED","DRAFT","ABANDONED"); CLOSED=@(); ABANDONED=@()
  }
  Assert-StatusTransition (Require-Text $Train "previousStatus" "Release Train $trainId") $status $transitions "Release Train $trainId" (Require-Text $Train "statusChangedAt" "Release Train $trainId") (Require-Text $Train "transitionAuthorityRef" "Release Train $trainId") "RELEASE_TRAIN" $trainId $trainId
  if($ExecutionSystemStatus-eq"ENABLED"-and$EnablementStatus-eq"ENABLED"){
    $trainAuthorityClosureFields=@("approvalRef","humanApprovalStatus","runtimeValidationApprovalRef","runtimeValidationAuditRef")
    $trainCarryFields=if($status-in@("ASSEMBLING","TRAIN_VERIFIED","HUMAN_ACCEPTED","PHASE_LOCKS_COMPLETED","CLOSED")){$trainAuthorityClosureFields}else{@()}
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
    Assert-RecordValue $record "charterDigest" ((Get-FileHash -LiteralPath (Join-Path $Root $charterRef) -Algorithm SHA256).Hash.ToLowerInvariant()) "Train business approval record"
    Assert-ExplicitHumanConfirmation $record "TRAIN_BUSINESS_APPROVAL" "TRAIN_BUSINESS_CONSTRUCTION" "AUTHORIZE_TRAIN_BUSINESS_CONSTRUCTION" "5ZCM5oSP5omn6KGM6K+lIFJlbGVhc2UgVHJhaW4g5Lia5Yqh5pa95bel" "APPROVED: AUTHORIZE RELEASE TRAIN BUSINESS CONSTRUCTION" "Train business approval record"
  } elseif ($approvalRef -ne "PENDING") {
    Fail "non-authorized Train must keep approvalRef=PENDING"
  }
  if ($status -eq "VALIDATION_AUTHORIZED") {
    if ($mode -ne "VALIDATION_ONLY" -or $ExecutionSystemStatus -ne "ENABLED" -or $EnablementStatus -ne "ENABLED" -or
        (Get-OptionalValue $Train "runtimeCanaryAuthorized") -ne $true -or $businessAuthorized) { Fail "VALIDATION_AUTHORIZED requires enabled validation-only authority with business writes false" }
    $candidate = Require-Text $Registry "auditedCandidateCommit" "Release Train Registry"
    $digest = Get-CandidateDigest $candidate
    $approval = Read-StrictRecord (Require-Text $Train "runtimeValidationApprovalRef" "Release Train $trainId") "Runtime validation approval record" @("governance/execution/approvals")
    $audit = Read-StrictRecord (Require-Text $Train "runtimeValidationAuditRef" "Release Train $trainId") "Runtime validation audit record" @("governance/execution/evidence")
    foreach ($entry in @($approval,$audit)) { Assert-RecordValue $entry.Record "trainId" $trainId "Runtime validation record"; Assert-RecordValue $entry.Record "candidateCommit" $candidate "Runtime validation record"; Assert-RecordValue $entry.Record "candidateDigest" $digest "Runtime validation record"; Assert-RecordValue $entry.Record "candidateDigestAlgorithm" "GIT_COMMIT_TREE_SHA256_V1" "Runtime validation record" }
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
    if($status-eq"CLOSED"){
      $notTerminal=@($units|Where-Object{$_.Status-notin@("CLOSED","ABANDONED")});if($notTerminal.Count){Fail "closed Train $trainId contains non-terminal Work Units"}
      if(@($ActiveLeases|Where-Object{"$($_.trainId)"-eq$trainId}).Count){Fail "closed Train $trainId still owns active leases"}
      if(@($QueueItems|Where-Object{"$($_.trainId)"-eq$trainId}).Count){Fail "closed Train $trainId still has Integration Queue items"}
      if(@($Reservations|Where-Object{"$($_.trainId)"-eq$trainId-and"$($_.status)".ToUpperInvariant()-in@("RESERVED","MATERIALIZED")}).Count){Fail "closed Train $trainId still owns an active migration reservation"}
    }
  }
  foreach($record in @($Records|Where-Object{$_.Status-in@("CLOSED","ABANDONED")})){
    if(@($ActiveLeases|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still owns active leases"}
    if(@($QueueItems|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still has an Integration Queue item"}
    if(@($Reservations|Where-Object{"$($_.trainId)"-eq$record.TrainId-and"$($_.workUnitId)"-eq$record.WorkUnitId-and"$($_.status)".ToUpperInvariant()-in@("RESERVED","MATERIALIZED")}).Count){Fail "terminal Work Unit $($record.WorkUnitId) still owns an active migration reservation"}
  }
}

function Assert-PackageMigrationReservationStatus([string]$WorkUnitStatus,[string]$ReservationStatus,[string]$Path) {
  $workUnitState=$WorkUnitStatus.ToUpperInvariant();$reservationState=$ReservationStatus.ToUpperInvariant()
  $allowed=if($workUnitState-in@("INTEGRATED","CLOSED")){@("MERGED")}else{@("RESERVED","MATERIALIZED")}
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
    $mandatoryPaths += @(Get-ChildItem -LiteralPath (Join-Path $Root "packages") -Recurse -Filter "index.ts" -File | Where-Object { $_.FullName -match '[\\/]src[\\/]index\.ts$' } | ForEach-Object { $_.FullName.Substring($Root.Length).TrimStart('\','/').Replace('\','/') })
    foreach ($rootConfig in @("pnpm-workspace.yaml","eslint.config.mjs","tsconfig.base.json","turbo.json","vitest.config.ts","vitest.phase22.workspace.ts","vitest.workspace.ts")) { if (Test-Path -LiteralPath (Join-Path $Root $rootConfig) -PathType Leaf) { $mandatoryPaths += $rootConfig } }
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
  & git -C $Root merge-base --is-ancestor $Revision HEAD *> $null
  if ($LASTEXITCODE -ne 0) { Fail "$Label frozenContractRevision is not in current integration history" }
  $currentRevision = (Invoke-Git $Root @("rev-parse","HEAD^{commit}") | Select-Object -First 1).Trim()
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
  &git -C $Root merge-base --is-ancestor $revision HEAD *> $null
  $isCurrent=$false
  if($LASTEXITCODE-eq0){$headRevision=(Invoke-Git $Root @("rev-parse","HEAD^{commit}")|Select-Object -First 1).Trim();$isCurrent=(Get-ProtectedPathsDigest $headRevision $paths)-eq$actualDigest}
  return [pscustomobject]@{ Revision=$revision.ToLowerInvariant(); Digest=$actualDigest; Paths=$paths; AuthorityRef=$entry.Ref; IsCurrent=$isCurrent }
}

function Assert-WorkUnitContractAuthority($Record, $Authority, [string]$CandidateCommit = "") {
  if ($null -eq $Authority) { Fail "business Work Unit $($Record.WorkUnitId) lacks Train frozen contract authority" }
  $revision = Require-Text $Record.Manifest "contractRevision" "Work Unit $($Record.WorkUnitId) contract authority"
  $recordStatus=if($null-eq$Record.PSObject.Properties["Status"]){""}else{"$($Record.Status)".ToUpperInvariant()}
  if($recordStatus-in@("STALE","CLOSED")){
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

function Assert-ReservationLedgerHistory($CurrentReservations) {
  $ledgerPath = "governance/execution/migration-reservations.json"
  $historyCommits = @(Invoke-Git $Root @("log","--format=%H","--",$ledgerPath) | Where-Object { $_ -match '^[0-9a-f]{40}$' })
  $sqlIntroductions=@();$sqlIntroductionKeys=@{}
  foreach($commit in @(Invoke-Git $Root @("rev-list","HEAD"))){
    foreach($entry in @(Invoke-Git $Root @("diff-tree","--root","-m","--no-renames","--no-commit-id","--name-status","--diff-filter=A","-r",$commit,"--","db/migrations"))){
      if($entry-match'^A\s+(db/migrations/(\d{3})[_-][^/]+\.sql)$'){$path=$Matches[1];$number=$Matches[2];$key="$commit`:$path".ToLowerInvariant();if(-not$sqlIntroductionKeys.ContainsKey($key)){$sqlIntroductionKeys[$key]=$true;$sqlIntroductions+=[pscustomobject]@{Commit="$commit".Trim();Path=$path;Number=$number}}}
    }
  }
  $currentByNumber = @{}
  foreach ($reservation in @($CurrentReservations)) { $currentByNumber["$($reservation.number)"] = $reservation }
  $statusTransitions = @{ RESERVED=@("RESERVED","MATERIALIZED","MERGED","ABANDONED");MATERIALIZED=@("MATERIALIZED","MERGED","ABANDONED");MERGED=@("MERGED");ABANDONED=@("ABANDONED") }
  foreach($current in @($CurrentReservations)){
    $number=Require-Text $current "number" "Current Migration Reservation";$presence=@()
    foreach($commit in $historyCommits){$ledger=Read-GitJson $commit $ledgerPath "Migration reservation introduction history";$match=@(Get-LedgerItems $ledger "reservations" "Migration reservation introduction history"|Where-Object{"$($_.number)"-eq$number});if($match.Count-gt0){$presence+=[pscustomobject]@{Commit="$commit";Record=$match[0]}}}
    if($presence.Count-eq0){Fail "migration reservation $number has no immutable introduction commit"}
    $introduction=$presence[-1];$initialStatus=(Require-Text $introduction.Record "status" "Migration reservation $number introduction").ToUpperInvariant()
    $isBootstrap024=$number-eq"024"-and$initialStatus-eq"ABANDONED"-and(Require-Text $introduction.Record "expectedFilename" "Migration reservation 024 introduction")-eq"NONE_PERMANENT_GAP_024"
    if(-not$isBootstrap024-and$initialStatus-ne"RESERVED"){Fail "migration reservation $number introduction status must be RESERVED, not $initialStatus"}
    $numberSqlIntroductions=@($sqlIntroductions|Where-Object Number -eq $number)
    if($number-eq"024"-and$numberSqlIntroductions.Count){Fail "permanent migration gap 024 has reachable SQL introduction history: $($numberSqlIntroductions.Path-join', ')"}
    if(-not$isBootstrap024){
      $null=Require-Text $introduction.Record "expectedFilename" "Migration reservation $number introduction"
      foreach($sql in $numberSqlIntroductions){
        if($sql.Commit-eq$introduction.Commit){Fail "migration reservation $number and $($sql.Path) were introduced in the same commit; RESERVATION must be a strict ancestor"}
        &git -C $Root merge-base --is-ancestor $introduction.Commit $sql.Commit *> $null
        if($LASTEXITCODE-ne0){Fail "migration reservation $number introduction is not a strict ancestor of SQL introduction $($sql.Path) at $($sql.Commit)"}
      }
    }
  }
  foreach ($commit in $historyCommits) {
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
      if (-not $statusTransitions.ContainsKey($oldStatus) -or $newStatus -notin $statusTransitions[$oldStatus]) { Fail "migration reservation $number has illegal historical status rewrite $oldStatus -> $newStatus" }
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
  foreach ($file in @(Get-ChildItem -LiteralPath $migrationRoot -Recurse -Force -File)) {
    $relative = $file.FullName.Substring($migrationRoot.Length).TrimStart('\','/').Replace('\','/')
    if ($relative.Contains('/') -or $relative -cnotmatch '^\d{3}[_-][^/]+\.sql$') {
      Fail "db/migrations may contain only top-level NNN_*.sql files: $relative"
    }
    $migrationFiles += $relative
  }
  $index = Get-UniqueMigrationIndex $migrationFiles
  $statusOutput = @(& git -C $RepositoryRoot status --porcelain=v1 -z --untracked-files=all --no-renames -- db/migrations 2>&1)
  if ($LASTEXITCODE -ne 0) { Fail "git status --porcelain -z failed while checking locked migrations: $($statusOutput -join ' ')" }
  $statusEntries = @((($statusOutput -join "`n") -split "`0") | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") })
  Assert-NoLockedMigrationStatusEntries $statusEntries
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
    composeTemplateSha256=(Get-FileHash -LiteralPath (Join-Path $Root $composeRef) -Algorithm SHA256).Hash.ToLowerInvariant()
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
  $oid = (Invoke-Git $Root @("rev-parse","HEAD`:$normalized") | Select-Object -First 1).Trim()
  if ($oid -notmatch '^[0-9a-f]{40}$') { Fail "$Label does not resolve to an immutable HEAD blob" }
  return $oid
}

function Assert-RecordBindingSet($DeclaredBindings, $RecordEntries, [string]$Label) {
  if ($null -eq $DeclaredBindings -or $DeclaredBindings -isnot [System.Array]) { Fail "$Label requires an immutable record binding array" }
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
  $evidenceFiles = @{}
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
    $evidenceFiles[$entry.Ref.ToLowerInvariant()] = (Get-FileHash -LiteralPath $entry.FullPath -Algorithm SHA256).Hash.ToLowerInvariant()
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
    $bindings = @(Get-Array $record "evidenceBindings")
    if ($bindings.Count -ne $evidenceFiles.Count) { Fail "audit evidenceBindings must cover every evidenceRef exactly once" }
    $seen = @{}
    foreach ($binding in $bindings) {
      Assert-AllowedFields $binding @("ref","sha256") "audit evidence binding"
      $bindingRef = (Assert-CanonicalTrackedPath (Require-Text $binding "ref" "audit evidence binding") "audit evidence binding" @("governance/execution/evidence")).ToLowerInvariant()
      if ($seen.ContainsKey($bindingRef) -or -not $evidenceFiles.ContainsKey($bindingRef)) { Fail "audit evidence binding is duplicate or not declared by Manifest: $bindingRef" }
      if ((Require-Text $binding "sha256" "audit evidence binding").ToLowerInvariant() -ne $evidenceFiles[$bindingRef]) { Fail "audit evidence digest mismatch: $bindingRef" }
      $seen[$bindingRef] = $true
    }
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
  if (-not (Test-Path -LiteralPath $WorkUnitsRoot -PathType Container)) {
    Fail "missing canonical Work Unit directory at $WorkUnitsRoot"
  }
  $records = @()
  foreach ($file in @(Get-ChildItem -LiteralPath $WorkUnitsRoot -Filter "*.json" -File | Sort-Object Name)) {
    $manifest = Read-Json $file.FullName "Work Unit Manifest"
    $label = "Work Unit Manifest $($file.Name)"
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
        -not (Test-Path -LiteralPath (Join-Path $Root $composeOverrideRef) -PathType Leaf)) {
      Fail "$label composeOverrideRef must resolve to the canonical managed-worktree Compose template"
    }

    $allowedPaths = @(Get-Array $manifest "allowedPaths" | ForEach-Object {
      Normalize-RepoPath "$_" "$label allowedPaths"
    })
    $executionModeMember = $manifest.PSObject.Properties["executionMode"]
    $executionMode = if ($null -eq $executionModeMember) { "WRITE" } else { "$($executionModeMember.Value)".ToUpperInvariant() }
    $businessWriteMember = $manifest.PSObject.Properties["businessWriteAuthorized"]
    $businessWriteAuthorized = $null -ne $businessWriteMember -and $businessWriteMember.Value -eq $true
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
      File = $file.FullName
      Manifest = $manifest
      TrainId = $trainId
      WorkUnitId = $workUnitId
      Status = $status
      Active = $status -notin $InactiveWorkUnitStatuses
      ExecutionMode = $executionMode
      BusinessWriteAuthorized = $businessWriteAuthorized
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

function Test-RepositoryGovernance {
  foreach ($path in @(
    (Join-Path $Root "governance/01_PROJECT_CONSTITUTION_DRAFT.md"),
    (Join-Path $Root "governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md"),
    $LeasesPath,
    $ReservationsPath,
    $TrainRegistryPath,
    $IntegrationQueuePath
  )) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Fail "missing canonical governance artifact: $path" }
  }

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
    if (-not (Test-Path -LiteralPath $charterPath -PathType Leaf)) { Fail "Release Train $trainId charterRef is missing: $charterRef" }
    $charterText = Get-Content -LiteralPath $charterPath -Raw -Encoding UTF8
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
    if($executionSystemStatus-eq"ENABLED"-and$enablementStatus-eq"ENABLED"){
      $previousWorkUnitStatus=Require-Text $record.Manifest "previousStatus" "Work Unit $($record.WorkUnitId)"
      $packageEvidenceClosureFields=@("candidateCommit","candidateDigest","candidateDigestAlgorithm","candidateRecordRef","baseCommit","contractRevision","environmentDigest","evidenceRefs","evidenceBindings")
      $packageAuditClosureFields=@($packageEvidenceClosureFields+@("auditRefs","auditBindings"))
      $sameStatusClosureFields=if($record.Status-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED","CLOSED","STALE")){$packageAuditClosureFields}else{@()}
      $carryForwardFields=if($record.Status-eq"PACKAGE_AUDITED"){$packageEvidenceClosureFields}elseif($record.Status-in@("QUEUED","INTEGRATED","CLOSED","STALE")-or($record.Status-eq"BLOCKED"-and$previousWorkUnitStatus-in@("PACKAGE_VERIFIED","PACKAGE_AUDITED","QUEUED","INTEGRATED"))){$packageAuditClosureFields}else{@()}
      Assert-StatusHistoryBinding $manifestRelative "WORK_UNIT" $record.WorkUnitId $record.Status $previousWorkUnitStatus (Require-Text $record.Manifest "statusChangedAt" "Work Unit $($record.WorkUnitId)") (Require-Text $record.Manifest "transitionAuthorityRef" "Work Unit $($record.WorkUnitId)") $record.TrainId $record.WorkUnitId (Require-Text $trainRegistry "auditedCandidateCommit" "Release Train Registry") $sameStatusClosureFields $carryForwardFields
    }
  }
  $allWorkUnitRefs = @($trains | ForEach-Object { Get-Array $_ "workUnitRefs" } | ForEach-Object { Normalize-RepoPath "$_" "Train workUnitRefs" })
  foreach ($ref in $allWorkUnitRefs) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $ref) -PathType Leaf)) { Fail "dangling Train workUnitRef: $ref" }
  }
  $writeStatuses = @("CONSTRUCTION_AUTHORIZED", "IN_CONSTRUCTION")
  $activeWrites = @($active | Where-Object { $_.ExecutionMode -eq "BUSINESS_CONSTRUCTION" -and $_.Status -in $writeStatuses -and $_.BusinessWriteAuthorized })
  if ($activeWrites.Count -gt $registryMaxWrite) { Fail "active WRITE Work Units exceed registry maximum $registryMaxWrite" }
  foreach ($train in $trains) {
    $trainId = "$($train.trainId)"
    $trainLimit = [int]$train.maxConcurrentWriteWorkUnits
    if (@($activeWrites | Where-Object { $_.TrainId -eq $trainId }).Count -gt $trainLimit) { Fail "active WRITE Work Units exceed Train $trainId maximum $trainLimit" }
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
  Assert-CanonicalWriterProtection $activeWrites $activeLeases
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
  $lockedMigrationChanges += Invoke-Git $Root @("diff", "--no-renames", "--name-only", "xlb-phase29-marketing-coupon^{}", "HEAD", "--", "db/migrations")
  $lockedMigrationChanges += Invoke-Git $Root @("diff", "--no-renames", "--name-only", "--", "db/migrations")
  $lockedMigrationChanges += Invoke-Git $Root @("diff", "--cached", "--no-renames", "--name-only", "--", "db/migrations")
  foreach ($path in @($lockedMigrationChanges | Sort-Object -Unique)) {
    if ($path -match '^db/migrations/(\d{3})[_-]' -and [int]$Matches[1] -le 57) {
      Fail "locked migration 000-057 differs from the canonical Phase29 tree: $path"
    }
  }
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
  }
  Assert-ReservationLedgerHistory $reservations
  foreach ($entry in $existingMigrations.GetEnumerator() | Where-Object { [int]$_.Key -gt 57 }) {
    $match = @($reservations | Where-Object { "$($_.number)" -eq $entry.Key -and "$($_.expectedFilename)" -eq $entry.Value -and "$($_.status)".ToUpperInvariant() -in @("MATERIALIZED", "MERGED") })
    if ($match.Count -ne 1) { Fail "migration file has no unique materialized/merged reservation: $($entry.Value)" }
  }

  foreach ($record in $records | Where-Object { $_.Status -in @("PACKAGE_VERIFIED", "PACKAGE_AUDITED", "QUEUED", "INTEGRATED", "CLOSED") }) {
    $manifestRelative=$record.File.Substring($Root.Length).TrimStart('\','/').Replace('\','/')
    $null=Assert-CanonicalTrackedPath $manifestRelative "Package-state Work Unit Manifest"
    $null=Assert-CanonicalTrackedPath "governance/execution/leases.json" "Package-state Lease Ledger"
    $candidateCommit = Require-Text $record.Manifest "candidateCommit" "Work Unit $($record.WorkUnitId)"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or
        (Invoke-Git $Root @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim() -ne "commit") {
      Fail "Work Unit $($record.WorkUnitId) candidateCommit must be an immutable commit object"
    }
    if($record.Status-ne"CLOSED"){Assert-LiveCandidateWorktree $record $candidateCommit}
    $digest = Require-Text $record.Manifest "candidateDigest" "Work Unit $($record.WorkUnitId)"
    $actualDigest = Assert-CandidateDigestBinding $candidateCommit $digest (Require-Text $record.Manifest "candidateDigestAlgorithm" "Work Unit $($record.WorkUnitId)") "Work Unit $($record.WorkUnitId)"
    $environmentDigest = if($record.Status-eq"CLOSED"){(Require-Text $record.Manifest "environmentDigest" "CLOSED Work Unit $($record.WorkUnitId)").ToLowerInvariant()}else{Get-EnvironmentDigest $record $leaseById}
    if ($record.Status-ne"CLOSED"-and(Require-Text $record.Manifest "environmentDigest" "Work Unit $($record.WorkUnitId)").ToLowerInvariant() -ne $environmentDigest) { Fail "environmentDigest does not match Manifest, Lease, port, and Compose inputs" }
    if ($record.ExecutionMode -eq "BUSINESS_CONSTRUCTION") {
      $contractAuthority = $trainContractAuthorities[$record.TrainId.ToLowerInvariant()]
      Assert-WorkUnitContractAuthority $record $contractAuthority $candidateCommit
    }
    Assert-PackageRecordBindings $record $candidateCommit $actualDigest $environmentDigest ($record.Status -in @("PACKAGE_AUDITED", "QUEUED", "INTEGRATED", "CLOSED"))
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
      Assert-PackageMigrationReservationStatus $record.Status (Require-Text $match[0] "status" "candidate migration reservation") $path
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
    if($executionSystemStatus-eq"ENABLED"-and$enablementStatus-eq"ENABLED"){Assert-QueueItemHistoryBinding $item $record $sequence (Require-Text $trainRegistry "auditedCandidateCommit" "Release Train Registry")}
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
  } else {
    Write-Output "WORK_UNIT_PARALLEL_ELIGIBLE train=$($record.TrainId) workUnit=$($record.WorkUnitId) target=$target changedPaths=$($changed.Count)"
  }
}

function Invoke-NegativeSelfTests {
  $passed = 0
  function Assert-Rejected([string]$Name, [scriptblock]$Action) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
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
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
  $fixtureRoot = Join-Path $tempRoot ("xlb-managed-gate-fixture-" + [Guid]::NewGuid().ToString("N"))
  $null = New-Item -ItemType Directory -Path $fixtureRoot
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
    Assert-Rejected "production CLOSED migration Work Unit cannot retain MATERIALIZED reservation" { Assert-PackageMigrationReservationStatus "CLOSED" "MATERIALIZED" "db/migrations/058_fixture.sql" }
    Assert-PackageMigrationReservationStatus "PACKAGE_AUDITED" "MATERIALIZED" "db/migrations/058_fixture.sql"
    Assert-PackageMigrationReservationStatus "CLOSED" "MERGED" "db/migrations/058_fixture.sql"
    Write-Host "self-test accepted: package-to-CLOSED migration reservation lifecycle"
    $closedEvidenceErasureFixture=[pscustomobject]@{TrainId="RT-CLOSED-FIXTURE";WorkUnitId="WU-TERMINAL";Status="CLOSED";Manifest=[pscustomobject]@{baseCommit=$head;contractRevision=$head;evidenceRefs=@();candidateRecordRef="PENDING";auditRefs=@()}}
    Assert-Rejected "production CLOSED Work Unit package evidence erasure" { Assert-PackageRecordBindings $closedEvidenceErasureFixture $head (Get-CandidateDigest $head) ('0'*64) $true }
    $writerAudit=[pscustomobject]@{recordType="INDEPENDENT_ENABLEMENT_AUDIT";scope="GOVERNANCE_EXECUTION_ENABLEMENT";result="PASS";independentFromWriter=$true;checks=@();actorRole="Writer"}
    Assert-Rejected "production self-declared independent audit" { Assert-IndependentAuditRecord $writerAudit "CANDIDATE_CONTENT_PREFLIGHT_PASS" "fixture independent audit" }

    $canonicalSource=$Root;$repositoryFixture=Join-Path $fixtureRoot "repository-context";$fixtureDirs+=$repositoryFixture
    $savedErrorAction=$ErrorActionPreference;$ErrorActionPreference="Continue"
    try{
      $cloneOutput=@(& git clone --shared --no-checkout $canonicalSource $repositoryFixture 2>&1);$cloneExit=$LASTEXITCODE
      if($cloneExit-ne0){throw"repository fixture clone failed: $($cloneOutput-join' ')"}
      $checkoutOutput=@(& git -C $repositoryFixture checkout HEAD 2>&1);$checkoutExit=$LASTEXITCODE
      if($checkoutExit-ne0){throw"repository fixture checkout failed: $($checkoutOutput-join' ')"}
    }finally{$ErrorActionPreference=$savedErrorAction}
    foreach($sourceFile in @(Get-ChildItem -LiteralPath (Join-Path $canonicalSource "governance/execution") -Recurse -File)){
      $relative=$sourceFile.FullName.Substring((Join-Path $canonicalSource "governance/execution").Length).TrimStart('\','/')
      $destination=Join-Path (Join-Path $repositoryFixture "governance/execution") $relative
      $destinationDirectory=Split-Path -Parent $destination;if(-not(Test-Path -LiteralPath $destinationDirectory)){New-Item -ItemType Directory -Path $destinationDirectory -Force|Out-Null}
      Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force
    }
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

    $strictApprovalDir=Join-Path $repositoryFixture "governance/execution/approvals";if(-not(Test-Path $strictApprovalDir)){New-Item -ItemType Directory -Path $strictApprovalDir -Force|Out-Null}
    $missingIdentityRef="governance/execution/approvals/STRICT-MISSING-IDENTITY-FIXTURE.json";$invalidTimeRef="governance/execution/approvals/STRICT-INVALID-TIME-FIXTURE.json"
    $strictBase=[ordered]@{schemaVersion=1;recordType="HUMAN_CONFIRMATION";createdAt="2026-07-14T00:00:00+08:00";candidateCommit=('0'*40);candidateDigest=('0'*64);candidateDigestAlgorithm="GIT_COMMIT_TREE_SHA256_V1";baseCommit=('0'*40);decision="APPROVED";scope="GOVERNANCE_EXECUTION_ENABLEMENT";confirmationCode="ENABLE_GOVERNANCE_EXECUTION";confirmationText="fixture";actorRole="Human Owner"}
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $missingIdentityRef),($strictBase|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $invalidTimeRecord=[ordered]@{};foreach($property in $strictBase.GetEnumerator()){$invalidTimeRecord[$property.Key]=$property.Value};$invalidTimeRecord.recordId="STRICT-INVALID-TIME";$invalidTimeRecord.createdAt="2026-07-14 00:00:00"
    [IO.File]::WriteAllText((Join-Path $repositoryFixture $invalidTimeRef),($invalidTimeRecord|ConvertTo-Json -Depth 10),[Text.Encoding]::UTF8)
    $null=&git -C $repositoryFixture add -- $missingIdentityRef $invalidTimeRef;$null=&git -C $repositoryFixture commit -m "fixture tracked invalid strict authority records"
    Assert-Rejected "full Repository tracked authority record missing recordId" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Read-StrictRecord $missingIdentityRef "tracked missing identity fixture" @("governance/execution/approvals") } }
    Assert-Rejected "full Repository tracked authority record invalid createdAt" { Invoke-WithRepositoryRoot $repositoryFixture { $null=Read-StrictRecord $invalidTimeRef "tracked invalid time fixture" @("governance/execution/approvals") } }

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
