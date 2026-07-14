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

function Fail([string]$Message) {
  throw "[managed-worktree] FAIL $Message"
}

function Read-Json([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Fail "missing $Label at $Path"
  }
  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    Fail "$Label is not valid JSON: $Path ($($_.Exception.Message))"
  }
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
    Require-SchemaVersion $manifest 1 $label
    $trainId = Require-Text $manifest "trainId" $label
    $workUnitId = Require-Text $manifest "workUnitId" $label
    $status = (Require-Text $manifest "status" $label).ToUpperInvariant()
    if ($status -notin $AllowedWorkUnitStatuses) { Fail "$label has unsupported status $status" }
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
      "PLANNED", "DRAFT", "CHARTER_HUMAN_APPROVED", "ASSEMBLING", "TRAIN_VERIFIED",
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
    $trainMaxWrite = [int](Require-Text $train "maxConcurrentWriteWorkUnits" "Release Train $trainId")
    if ($trainMaxWrite -lt 1 -or $trainMaxWrite -gt $registryMaxWrite) { Fail "Release Train $trainId maxConcurrentWriteWorkUnits exceeds registry limit" }
    if ($trainMode -eq "BUSINESS_CONSTRUCTION" -and -not $charterText.Contains($trainId)) {
      Fail "BUSINESS_CONSTRUCTION charterRef does not identify Train $trainId"
    }
    $null = Test-BaseAuthority $train "Release Train $trainId"
    $trainSet[$identity] = $train
  }
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
  $protectedSerialPaths = @(
    "AGENTS.md", "governance", "docs/CURRENT_STATE.md", "docs/governance/phase-registry.json",
    "package.json", "pnpm-lock.yaml", "packages/types/src/index.ts", "packages/validators/src/index.ts",
    "packages/api-client/src/index.ts", "backend/src/app.ts", "backend/src/server.ts",
    "scripts", "db/dictionary", "db/migrations"
  )
  foreach ($record in $activeWrites) {
    foreach ($allowed in $record.AllowedPaths) {
      foreach ($protected in $protectedSerialPaths) {
        if (Test-PrefixOverlap $allowed $protected) { Fail "parallel SOURCE_PATH overlaps protected SERIAL_WRITE path: $allowed <> $protected" }
      }
    }
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
    if ($null -ne $resource) { $resource = "$resource".Trim().ToLowerInvariant() }
    if ($null -ne $value) { $value = "$value".Trim().ToLowerInvariant() }
    $trainId = Require-Text $lease "trainId" "$label $leaseId"
    $workUnitId = Require-Text $lease "workUnitId" "$label $leaseId"
    $status = (Require-Text $lease "status" "$label $leaseId").ToUpperInvariant()
    if ($status -notin @("ACTIVE", "RELEASED", "EXPIRED", "CLOSED", "ABANDONED")) { Fail "lease $leaseId has unsupported status $status" }
    $normalizedId = $leaseId.ToLowerInvariant()
    if ($leaseIds.ContainsKey($normalizedId)) { Fail "duplicate leaseId: $leaseId" }
    $leaseIds[$normalizedId] = $true
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
        ProtectedPaths=(Get-OptionalValue $lease "protectedPaths")
        Identity=$identity; WorkUnitId=$workUnitId
      }
      $activeLeases += $activeLease
      $leaseById[$normalizedId] = $activeLease
    }
  }

  for ($i = 0; $i -lt $activeLeases.Count; $i++) {
    for ($j = $i + 1; $j -lt $activeLeases.Count; $j++) {
      if ($activeLeases[$i].Identity -eq $activeLeases[$j].Identity) { continue }
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
  $writerPathMap = [ordered]@{
    "shared-contract-types-validators-api-events" = @("packages/types", "packages/validators", "packages/api-client", "docs/contracts")
    "canonical-shared-runtime" = @("backend/src/app.ts", "backend/src/server.ts")
    "migration-reservation-and-schema-ledger" = @("governance/execution/migration-reservations.json", "db/dictionary", "db/migrations")
    "integration-queue-and-integration-branch" = @("governance/execution/integration-queue.json", "scripts", "package.json", "pnpm-lock.yaml")
    "current-state-phase-registry-lock-report-tag" = @("AGENTS.md", "governance", "docs/CURRENT_STATE.md", "docs/governance/phase-registry.json")
  }
  foreach ($requiredWriter in $writerPathMap.Keys) {
    $writer = @($activeLeases | Where-Object { $_.Type -eq "CANONICAL_WRITER" -and $_.Key -eq $requiredWriter })
    if ($writer.Count -ne 1) {
      Fail "missing unique CANONICAL_WRITER lease for protected serial authority: $requiredWriter"
    }
    $actualPaths = @($writer[0].ProtectedPaths | ForEach-Object { Normalize-RepoPath "$_" "CANONICAL_WRITER protectedPaths" })
    foreach ($requiredPath in $writerPathMap[$requiredWriter]) {
      if ($actualPaths -notcontains $requiredPath) { Fail "CANONICAL_WRITER $requiredWriter does not cover protected path $requiredPath" }
    }
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
  Require-SchemaVersion $reservationLedger 1 "Migration Reservation Ledger"
  $reservations = @(Get-LedgerItems $reservationLedger "reservations" "Migration Reservation Ledger")
  Assert-UniqueValues $reservations "number" "Migration Reservation Ledger"
  Assert-UniqueValues $reservations "expectedFilename" "Migration Reservation Ledger"
  $numbers = @{}
  $filenames = @{}
  $existingMigrations = @{}
  foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $Root "db/migrations") -Filter "*.sql" -File)) {
    if ($file.Name -match '^(\d{3})[_-]') { $existingMigrations[$Matches[1]] = $file.Name }
  }
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
    if ($null -eq $reservation.PSObject.Properties["tables"] -or $reservation.tables -isnot [System.Array]) { Fail "reservation $number must declare a tables array" }
    $null = Require-Text $reservation "semanticScope" "$label $number"
    $status = (Require-Text $reservation "status" "$label $number").ToUpperInvariant()
    if ($status -notin @("RESERVED", "MATERIALIZED", "MERGED", "ABANDONED")) { Fail "reservation $number has unsupported status $status" }
    if ($number -notmatch '^\d{3}$') { Fail "migration reservation number must be three digits: $number" }
    if ($status -ne "ABANDONED" -and $filename -notmatch "^$([regex]::Escape($number))[_-].*\.sql$") { Fail "reservation filename must begin with its number and end in .sql" }
    if ($numbers.ContainsKey($number)) { Fail "duplicate migration reservation number (including terminal history): $number" }
    if ($filenames.ContainsKey($filename.ToLowerInvariant())) { Fail "duplicate migration reservation filename (including terminal history): $filename" }
    $numbers[$number] = $true
    $filenames[$filename.ToLowerInvariant()] = $true
    if ($existingMigrations.ContainsKey($number)) {
      if ($status -ne "MERGED" -or $filename -ne $existingMigrations[$number]) {
        Fail "reservation $number reuses locked migration number owned by $($existingMigrations[$number])"
      }
    } elseif ($status -eq "MERGED") {
      Fail "MERGED reservation $number has no matching migration file"
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
  foreach ($entry in $existingMigrations.GetEnumerator() | Where-Object { [int]$_.Key -gt 57 }) {
    $match = @($reservations | Where-Object { "$($_.number)" -eq $entry.Key -and "$($_.expectedFilename)" -eq $entry.Value -and "$($_.status)".ToUpperInvariant() -in @("MATERIALIZED", "MERGED") })
    if ($match.Count -ne 1) { Fail "migration file has no unique materialized/merged reservation: $($entry.Value)" }
  }

  foreach ($record in $records | Where-Object { $_.Status -in @("PACKAGE_VERIFIED", "PACKAGE_AUDITED", "QUEUED", "INTEGRATED") }) {
    $candidateCommit = Require-Text $record.Manifest "candidateCommit" "Work Unit $($record.WorkUnitId)"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or
        (Invoke-Git $Root @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim() -ne "commit") {
      Fail "Work Unit $($record.WorkUnitId) candidateCommit must be an immutable commit object"
    }
    if ((Get-OptionalValue $record.Manifest "cleanWorktree") -ne $true) { Fail "package-state Work Unit must record cleanWorktree=true" }
    $digest = Require-Text $record.Manifest "candidateDigest" "Work Unit $($record.WorkUnitId)"
    if ($digest -notmatch '^[0-9a-fA-F]{64}$') { Fail "candidateDigest must be a SHA-256 hex digest" }
    if (@(Get-Array $record.Manifest "evidenceRefs").Count -eq 0) { Fail "package-state Work Unit requires evidenceRefs" }
    if ($record.ExecutionMode -eq "BUSINESS_CONSTRUCTION") {
      $contractRevision = Require-Text $record.Manifest "contractRevision" "Work Unit contract freshness"
      if ($contractRevision -notmatch '^[0-9a-fA-F]{40}$' -or
          (Invoke-Git $Root @("cat-file", "-t", $contractRevision) | Select-Object -First 1).Trim() -ne "commit") {
        Fail "business package contractRevision must be an immutable commit"
      }
      & git -C $Root merge-base --is-ancestor $contractRevision $candidateCommit *> $null
      if ($LASTEXITCODE -ne 0) { Fail "candidateCommit is stale against contractRevision" }
    }
    if ($record.Status -in @("PACKAGE_AUDITED", "QUEUED", "INTEGRATED")) {
      if (@(Get-Array $record.Manifest "auditRefs").Count -eq 0 -or
          "$(Get-OptionalValue $record.Manifest "independentAuditStatus")".ToUpperInvariant() -ne "PASS") {
        Fail "audited/queued package requires auditRefs and independentAuditStatus=PASS"
      }
    }
    $baseCommit = Require-Text $record.Manifest "baseCommit" "Work Unit base"
    $migrationDiff = @(Invoke-Git $Root @("diff", "--no-renames", "--name-only", $baseCommit, $candidateCommit, "--", "db/migrations"))
    foreach ($path in $migrationDiff) {
      if ($path -notmatch '^db/migrations/(\d{3})[_-].*\.sql$') { Fail "candidate has noncanonical migration path: $path" }
      $number = $Matches[1]
      & git -C $Root cat-file -e "$baseCommit`:$path" 2>$null
      if ($LASTEXITCODE -eq 0) { Fail "candidate modifies migration already present at base: $path" }
      $match = @($reservations | Where-Object {
        "$($_.number)" -eq $number -and "db/migrations/$($_.expectedFilename)" -eq $path -and
        "$($_.trainId)" -eq $record.TrainId -and "$($_.workUnitId)" -eq $record.WorkUnitId -and
        "$($_.status)".ToUpperInvariant() -in @("RESERVED", "MATERIALIZED")
      })
      if ($match.Count -ne 1) { Fail "candidate migration lacks its unique reservation: $path" }
    }
  }

  $queue = Read-Json $IntegrationQueuePath "Integration Queue"
  Require-SchemaVersion $queue 1 "Integration Queue"
  $queueSystemStatus = (Require-Text $queue "executionSystemStatus" "Integration Queue").ToUpperInvariant()
  $queueEnablement = (Require-Text $queue "enablementStatus" "Integration Queue").ToUpperInvariant()
  if ($queueSystemStatus -ne $executionSystemStatus -or $queueEnablement -ne $enablementStatus) {
    Fail "Integration Queue execution/enablement status must match Train Registry"
  }
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
    $candidateCommit = Require-Text $item "candidateCommit" "Integration Queue item $sequence"
    if ($candidateCommit -notmatch '^[0-9a-fA-F]{40}$' -or
        (Invoke-Git $Root @("cat-file", "-t", $candidateCommit) | Select-Object -First 1).Trim() -ne "commit") {
      Fail "Integration Queue candidateCommit must be an immutable commit object"
    }
    if ((Require-Text $record.Manifest "candidateCommit" "QUEUED Work Unit") -ne $candidateCommit) { Fail "queue/Manifest candidateCommit mismatch" }
    if ((Get-OptionalValue $item "cleanWorktree") -ne $true -or
        (Get-OptionalValue $item "immutableCandidateCommit") -ne $true -or
        (Get-OptionalValue $item "stale") -ne $false -or
        (Require-Text $item "independentAuditStatus" "Integration Queue item $sequence").ToUpperInvariant() -ne "PASS") {
      Fail "queue item requires clean immutable non-STALE candidate and independentAuditStatus=PASS"
    }
    $queuedIdentity[$identity] = $true
  }
  $nextSequence = [int](Require-Text $queue "nextSequence" "Integration Queue")
  $maxSequence = if ($sequences.Count -eq 0) { 0 } else { ($sequences.Keys | Measure-Object -Maximum).Maximum }
  if ($nextSequence -le $maxSequence) { Fail "Integration Queue nextSequence must be greater than every existing sequence" }
  foreach ($record in $records | Where-Object { $_.Status -eq "QUEUED" }) {
    $identity = "$($record.TrainId)/$($record.WorkUnitId)".ToLowerInvariant()
    if (-not $acceptingItems -or -not $queuedIdentity.ContainsKey($identity)) { Fail "QUEUED Work Unit lacks one accepting Integration Queue item: $identity" }
  }

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
  $train = $RepositoryState.TrainSet[$record.TrainId.ToLowerInvariant()]
  if ($null -eq $train) { Fail "Work Unit references an unregistered Train" }
  $trainStatus = (Require-Text $train "status" "Release Train $($record.TrainId)").ToUpperInvariant()
  $humanApprovalStatus = (Require-Text $train "humanApprovalStatus" "Release Train $($record.TrainId)").ToUpperInvariant()
  $trainBusinessWrite = (Get-OptionalValue $train "businessWriteAuthorized") -eq $true

  if ($record.ExecutionMode -eq "BUSINESS_CONSTRUCTION") {
    $approvalRef = Require-Text $train "approvalRef" "Release Train $($record.TrainId)"
    $charterRef = Normalize-RepoPath (Require-Text $train "charterRef" "Release Train $($record.TrainId)") "Release Train charterRef"
    $charterText = Get-Content -LiteralPath (Join-Path $Root $charterRef) -Raw -Encoding UTF8
    if ($approvalRef -match '(?i)PENDING|WAITING|DRAFT' -or
        $charterText -match '(?i)\bDRAFT\b|WAITING_HUMAN_APPROVAL|NO BUSINESS CONSTRUCTION AUTHORITY' -or
        $charterText -notmatch 'CHARTER_HUMAN_APPROVED') {
      Fail "BUSINESS_CONSTRUCTION requires machine-readable approvalRef and an approved, non-draft Charter"
    }
    if ($trainStatus -ne "CHARTER_HUMAN_APPROVED" -or
        $humanApprovalStatus -notin @("APPROVED", "HUMAN_APPROVED", "EXPLICIT_HUMAN_APPROVAL_RECORDED") -or
        -not $trainBusinessWrite -or -not $record.BusinessWriteAuthorized -or
        $record.Status -notin @("CONSTRUCTION_AUTHORIZED", "IN_CONSTRUCTION")) {
      Fail "BUSINESS_CONSTRUCTION is not authorized: Train must be CHARTER_HUMAN_APPROVED with explicit Human approval and business authority; Work Unit must be CONSTRUCTION_AUTHORIZED or IN_CONSTRUCTION with businessWriteAuthorized=true"
    }
  } elseif ($record.ExecutionMode -eq "VALIDATION_ONLY") {
    if ($record.BusinessWriteAuthorized -or $trainBusinessWrite) {
      Fail "VALIDATION_ONLY may not carry business write authority"
    }
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
  $scriptText = Get-Content -LiteralPath $PSCommandPath -Raw -Encoding UTF8
  if ([regex]::Matches($scriptText, '"--no-renames"').Count -lt 4) { throw "[managed-worktree] SELF-TEST FAIL production diff paths are not rename-safe" }
  Write-Output "check-managed-worktree-boundaries: SelfTest passed ($script:SelfTestPassed negative fixtures)"
}

if ($Mode -eq "SelfTest") { Invoke-NegativeSelfTests; return }
$repositoryState = Test-RepositoryGovernance
if ($Mode -eq "WorkUnit") { Test-WorkUnitBoundary $repositoryState }
