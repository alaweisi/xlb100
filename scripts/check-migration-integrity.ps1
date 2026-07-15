[CmdletBinding()]
param(
  [ValidateSet("Staged", "WorkingTree", "Range")]
  [string]$DiffMode = "Staged"
)

$ErrorActionPreference = "Stop"
$Root = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { throw "check-migration-integrity must run inside the XLB repository" }

function Invoke-GitLines([string[]]$Arguments, [bool]$AllowEmpty = $true) {
  $output = @(& git -C $Root @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    $commandText = $Arguments -join " "
    $outputText = $output -join [Environment]::NewLine
    throw "git $commandText failed: $outputText"
  }
  $lines = @($output | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ })
  if (-not $AllowEmpty -and $lines.Count -eq 0) { throw "git command returned no data" }
  return $lines
}

function Get-LatestLockedTag {
  $statePath = Join-Path $Root "docs/CURRENT_STATE.md"
  if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw "docs/CURRENT_STATE.md is missing" }
  $locked = @()
  foreach ($line in Get-Content -Encoding UTF8 -LiteralPath $statePath) {
    if ($line -match '^\| Phase (\d+)[A-Z]? \| LOCKED \| ([^|]+) \|') {
      $tag = $Matches[2].Trim()
      if ($tag -ne ([char]0x2014) -and $tag -ne "-") {
        $locked += [pscustomobject]@{ Phase=[int]$Matches[1]; Tag=$tag }
      }
    }
  }
  if ($locked.Count -eq 0) { throw "CURRENT_STATE has no locked Phase tag" }
  return ($locked | Sort-Object Phase -Descending | Select-Object -First 1).Tag
}

function Get-CandidateMigrationPaths {
  if ($DiffMode -in @("Staged", "Range")) {
    $tree = if ($DiffMode -eq "Staged") { (git -C $Root write-tree 2>$null).Trim() } else { (git -C $Root rev-parse "HEAD^{tree}" 2>$null).Trim() }
    if ($LASTEXITCODE -ne 0 -or $tree -notmatch '^[0-9a-f]{40,64}$') { throw "cannot resolve staged tree" }
    return [pscustomobject]@{
      Tree=$tree
      Paths=@(Invoke-GitLines @("ls-tree", "-r", "--name-only", $tree, "--", "db/migrations"))
    }
  }

  $migrationRoot = Join-Path $Root "db/migrations"
  $paths = if (Test-Path -LiteralPath $migrationRoot) {
    @(Get-ChildItem -LiteralPath $migrationRoot -File -Recurse | ForEach-Object {
      $_.FullName.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
    })
  } else { @() }
  return [pscustomobject]@{ Tree=""; Paths=$paths }
}

$lockTag = Get-LatestLockedTag
$lockCommit = (git -C $Root rev-parse "$lockTag^{}" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $lockCommit -notmatch '^[0-9a-f]{40}$') { throw "locked tag cannot be resolved: $lockTag" }

$candidate = Get-CandidateMigrationPaths
$paths = @($candidate.Paths | Sort-Object -Unique)
$numbers = @{}
foreach ($path in $paths) {
  if ($path -notmatch '^db/migrations/(\d{3})_[^/]+\.sql$') {
    throw "migration path must be a top-level NNN_name.sql file: $path"
  }
  $number = $Matches[1]
  if ($numbers.ContainsKey($number)) { throw "duplicate migration number ${number}: $($numbers[$number]) and $path" }
  $numbers[$number] = $path
}

$lockedPaths = @(Invoke-GitLines @("ls-tree", "-r", "--name-only", $lockCommit, "--", "db/migrations"))
$lockedNumbers = @{}
foreach ($path in $lockedPaths) {
  if ($path -notmatch '^db/migrations/(\d{3})_[^/]+\.sql$') { throw "locked tag contains noncanonical migration: $path" }
  $number = $Matches[1]
  if ($lockedNumbers.ContainsKey($number)) { throw "locked tag contains duplicate migration number $number" }
  $lockedNumbers[$number] = $path
  if ($path -notin $paths) { throw "published migration cannot be deleted or renamed: $path" }

  if ($DiffMode -in @("Staged", "Range")) {
    $lockedBlob = (git -C $Root rev-parse "${lockCommit}:$path" 2>$null).Trim()
    $candidateBlob = (git -C $Root rev-parse "$($candidate.Tree):$path" 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $lockedBlob -ne $candidateBlob) { throw "published migration cannot be rewritten: $path" }
  } else {
    $lockedText = @(& git -C $Root show "${lockCommit}:$path" 2>$null)
    if ($LASTEXITCODE -ne 0) { throw "cannot read locked migration: $path" }
    $workingText = Get-Content -LiteralPath (Join-Path $Root $path) -Raw -Encoding UTF8
    $lockedNormalized = (($lockedText -join "`n") -replace "`r`n", "`n").TrimEnd("`r", "`n")
    $workingNormalized = ($workingText -replace "`r`n", "`n").TrimEnd("`r", "`n")
    if ($lockedNormalized -cne $workingNormalized) {
      throw "published migration cannot be rewritten: $path"
    }
  }
}

$maxLocked = @($lockedNumbers.Keys | ForEach-Object { [int]$_ } | Measure-Object -Maximum).Maximum
foreach ($number in $numbers.Keys) {
  if (-not $lockedNumbers.ContainsKey($number) -and [int]$number -le $maxLocked) {
    throw "new migration reuses a published number: $number"
  }
}

Write-Output "MIGRATION_INTEGRITY PASS lockTag=$lockTag locked=$($lockedPaths.Count) candidate=$($paths.Count)"
