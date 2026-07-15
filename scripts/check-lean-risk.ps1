[CmdletBinding()]
param(
  [ValidateSet("Staged", "WorkingTree", "Range")]
  [string]$DiffMode = "Staged",
  [string]$BaseRef = "",
  [ValidateSet("Check", "Approve", "Clear")]
  [string]$Action = "Check",
  [string]$Confirmation = ""
)

$ErrorActionPreference = "Stop"
$Root = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $Root) { throw "check-lean-risk must run inside the XLB repository" }

function Invoke-GitLines([string[]]$Arguments) {
  $output = @(& git -C $Root @Arguments 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)" }
  return @($output | ForEach-Object { "$($_)".Trim() } | Where-Object { $_ })
}

function Get-ChangedPaths {
  switch ($DiffMode) {
    "Staged" {
      return @(Invoke-GitLines @("diff", "--cached", "--name-only", "--diff-filter=ACMRD", "--no-renames"))
    }
    "WorkingTree" {
      $paths = @()
      $paths += Invoke-GitLines @("diff", "--name-only", "--diff-filter=ACMRD", "--no-renames")
      $paths += Invoke-GitLines @("diff", "--cached", "--name-only", "--diff-filter=ACMRD", "--no-renames")
      $paths += Invoke-GitLines @("ls-files", "--others", "--exclude-standard")
      return @($paths | Sort-Object -Unique)
    }
    "Range" {
      if ([string]::IsNullOrWhiteSpace($BaseRef)) { throw "-BaseRef is required for Range mode" }
      return @(Invoke-GitLines @("diff", "--name-only", "--diff-filter=ACMRD", "--no-renames", "$BaseRef...HEAD"))
    }
  }
}

function Get-ApprovalLogPath {
  $gitPath = (git -C $Root rev-parse --git-path xlb-high-risk-approvals.jsonl 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitPath)) { throw "cannot resolve local approval log path" }
  if ([IO.Path]::IsPathRooted($gitPath)) { return [IO.Path]::GetFullPath($gitPath) }
  return [IO.Path]::GetFullPath((Join-Path $Root $gitPath))
}

function Append-ApprovalLog([object]$Record) {
  $path = Get-ApprovalLogPath
  $parent = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { [IO.Directory]::CreateDirectory($parent) | Out-Null }
  $line = $Record | ConvertTo-Json -Compress -Depth 6
  [IO.File]::AppendAllText($path, $line + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  return $path
}

function Read-ActiveApproval {
  $path = Get-ApprovalLogPath
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
  $lines = @(Get-Content -Encoding UTF8 -LiteralPath $path | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  for ($index = $lines.Count - 1; $index -ge 0; $index--) {
    try { $record = $lines[$index] | ConvertFrom-Json } catch { continue }
    if ("$($record.decision)" -eq "CLEARED") { return $null }
    if ("$($record.decision)" -eq "APPROVED") { return $record }
  }
  return $null
}

$SensitiveRules = @(
  [pscustomobject]@{ Id="MIGRATION"; Pattern='^db/migrations(?:/|$)'; Reason="database migration" },
  [pscustomobject]@{ Id="DATA_OPERATION"; Pattern='(?i)^(scripts|deploy)/(?:[^/]+/)*[^/]*(migrat|backup|restore|recovery|stage4a)[^/]*\.(ps1|mjs|ts)$'; Reason="database migration, backup, restore, recovery, or destructive validation operation" },
  [pscustomobject]@{ Id="AUTHORIZATION"; Pattern='(?i)(^|/)(auth|authentication|authorization|authz|permission|permissions|rbac)(/|[^/]*)'; Reason="authentication or authorization boundary" },
  [pscustomobject]@{ Id="MONEY"; Pattern='(?i)(^|/)(payment|payments|refund|refunds|ledger|settlement|payout|withdrawal)(/|[^/]*)'; Reason="payment, refund, ledger, settlement, payout, or withdrawal" },
  [pscustomobject]@{ Id="SHARED_CONTRACT"; Pattern='^packages/(types|api-client)(?:/|$)'; Reason="shared types or API client contract" },
  [pscustomobject]@{ Id="PRODUCTION"; Pattern='(?i)^(deploy/production|deploy/compose/[^/]*prod|infra)(?:/|$)|(^|/)(?:\.env\.)?(production|prod)(/|[._-]|$)'; Reason="production or infrastructure configuration" },
  [pscustomobject]@{ Id="PROVIDER"; Pattern='(?i)(^|/)providers?(?:/|[^/]*)|(^|/)[^/]*provider[^/]*$'; Reason="external provider integration" }
)

if ($Action -eq "Clear") {
  $logPath = Append-ApprovalLog ([ordered]@{
    decision = "CLEARED"
    recordedAt = [DateTimeOffset]::Now.ToString("o")
  })
  Write-Output "HIGH_RISK_APPROVAL_CLEARED log=$logPath"
  exit 0
}

$paths = @(Get-ChangedPaths | ForEach-Object { $_.Replace('\', '/') } | Sort-Object -Unique)
if ($paths.Count -eq 0) {
  if ($Action -eq "Approve") { throw "no changed paths are available for approval" }
  Write-Output "LEAN_RISK ordinary: no changed paths"
  exit 0
}

$hits = @()
foreach ($path in $paths) {
  foreach ($rule in $SensitiveRules) {
    if ($path -match $rule.Pattern) {
      $hits += [pscustomobject]@{ Path=$path; Rule=$rule.Id; Reason=$rule.Reason }
    }
  }
}
$hits = @($hits | Sort-Object Path, Rule -Unique)

if ($hits.Count -eq 0) {
  if ($Action -eq "Approve") { throw "ordinary changes do not need Human approval" }
  Write-Output "LEAN_RISK ordinary: $($paths.Count) changed path(s), no sensitive path matched"
  exit 0
}

if (@($hits | Where-Object Rule -eq "MIGRATION").Count -gt 0) {
  $migrationCheck = Join-Path $Root "scripts/check-migration-integrity.ps1"
  if (-not (Test-Path -LiteralPath $migrationCheck -PathType Leaf)) { throw "migration integrity checker is missing" }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $migrationCheck -DiffMode $DiffMode
  if ($LASTEXITCODE -ne 0) { throw "migration integrity check failed" }
}

foreach ($hit in $hits) {
  Write-Output "HIGH_RISK path=$($hit.Path) rule=$($hit.Rule) reason=$($hit.Reason)"
}

if ($Action -eq "Approve") {
  if ([string]::IsNullOrWhiteSpace($Confirmation)) { throw "-Confirmation must contain the Human reply" }
  $head = (git -C $Root rev-parse HEAD 2>$null).Trim()
  $record = [ordered]@{
    decision = "APPROVED"
    recordedAt = [DateTimeOffset]::Now.ToString("o")
    source = "Human conversation"
    confirmation = $Confirmation.Trim()
    headAtApproval = $head
    categories = @($hits.Rule | Sort-Object -Unique)
    paths = @($hits.Path | Sort-Object -Unique)
  }
  $logPath = Append-ApprovalLog $record
  Write-Output "HIGH_RISK_APPROVAL_RECORDED categories=$(@($record.categories) -join ',') paths=$(@($record.paths).Count) log=$logPath"
  exit 0
}

$approval = Read-ActiveApproval
$approvedPaths = if ($null -eq $approval) { @() } else { @($approval.paths | ForEach-Object { "$($_)" }) }
$unapprovedPaths = @($hits.Path | Sort-Object -Unique | Where-Object { $_ -notin $approvedPaths })
if ($null -eq $approval -or $unapprovedPaths.Count -gt 0) {
  if ($unapprovedPaths.Count -gt 0) { [Console]::Error.WriteLine("UNAPPROVED_HIGH_RISK_PATHS: $($unapprovedPaths -join ', ')") }
  [Console]::Error.WriteLine("HIGH_RISK_CONFIRMATION_REQUIRED: show the summary above to Human once, then record the natural-language reply with check-lean-risk.ps1 -Action Approve -DiffMode WorkingTree -Confirmation '<reply>'. No Queue, Train, Manifest, Lease, approval file, expiry, or environment variable is required.")
  exit 3
}

Write-Output "HIGH_RISK_APPROVED: one Human conversation approval covers these paths for the active construction batch"
exit 0
