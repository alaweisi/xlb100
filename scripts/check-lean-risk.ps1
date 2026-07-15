[CmdletBinding()]
param(
  [ValidateSet("Staged", "WorkingTree", "Range")]
  [string]$DiffMode = "Staged",
  [string]$BaseRef = "",
  [string]$ApprovalFile = $env:XLB_HIGH_RISK_APPROVAL_FILE
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

$SensitiveRules = @(
  [pscustomobject]@{ Id="MIGRATION"; Pattern='^db/migrations(?:/|$)'; Reason="database migration" },
  [pscustomobject]@{ Id="AUTHORIZATION"; Pattern='(?i)(^|/)(auth|authentication|authorization|authz|permission|permissions|rbac)(/|[^/]*)'; Reason="authentication or authorization boundary" },
  [pscustomobject]@{ Id="MONEY"; Pattern='(?i)(^|/)(payment|payments|refund|refunds|ledger|settlement)(/|[^/]*)'; Reason="payment, refund, ledger, or settlement" },
  [pscustomobject]@{ Id="SHARED_CONTRACT"; Pattern='^packages/(types|api-client)(?:/|$)'; Reason="shared types or API client contract" },
  [pscustomobject]@{ Id="PRODUCTION"; Pattern='(?i)^(deploy/production|deploy/compose/[^/]*prod|infra)(?:/|$)|(^|/)(production|prod)(/|[._-])'; Reason="production or infrastructure configuration" },
  [pscustomobject]@{ Id="PROVIDER"; Pattern='(?i)(^|/)providers?(?:/|[^/]*)|(^|/)[^/]*provider[^/]*$'; Reason="external provider integration" }
)

$paths = @(Get-ChangedPaths | ForEach-Object { $_.Replace('\', '/') } | Sort-Object -Unique)
if ($paths.Count -eq 0) {
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
  Write-Output "LEAN_RISK ordinary: $($paths.Count) changed path(s), no sensitive path matched"
  exit 0
}

if (@($hits | Where-Object Rule -eq "MIGRATION").Count -gt 0) {
  $migrationCheck = Join-Path $Root "scripts/check-migration-integrity.ps1"
  if (-not (Test-Path -LiteralPath $migrationCheck -PathType Leaf)) { throw "migration integrity checker is missing" }
  & powershell -NoProfile -ExecutionPolicy Bypass -File $migrationCheck -DiffMode $DiffMode
  if ($LASTEXITCODE -ne 0) { throw "migration integrity check failed" }
}

$approvalValid = $false
if (-not [string]::IsNullOrWhiteSpace($ApprovalFile)) {
  if ($DiffMode -ne "Staged") { throw "high-risk approval binding is supported only for Staged mode" }
  $resolvedApproval = [IO.Path]::GetFullPath($ApprovalFile)
  if (-not (Test-Path -LiteralPath $resolvedApproval -PathType Leaf)) { throw "high-risk approval file does not exist: $resolvedApproval" }
  $approval = Get-Content -Raw -Encoding UTF8 -LiteralPath $resolvedApproval | ConvertFrom-Json
  $stagedTree = (git -C $Root write-tree 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $stagedTree -notmatch '^[0-9a-f]{40,64}$') { throw "cannot resolve staged tree for approval binding" }
  $expiresAt = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse("$($approval.expiresAt)", [ref]$expiresAt)) { throw "high-risk approval has invalid expiresAt" }
  $approvalValid = (
    "$($approval.decision)" -eq "APPROVED" -and
    "$($approval.approvedBy)" -eq "Human Owner" -and
    -not [string]::IsNullOrWhiteSpace("$($approval.confirmation)") -and
    "$($approval.stagedTree)" -eq $stagedTree -and
    $expiresAt -gt [DateTimeOffset]::UtcNow
  )
  if (-not $approvalValid) { throw "high-risk approval is missing, expired, or not bound to the current staged tree" }
}

foreach ($hit in $hits) {
  Write-Output "HIGH_RISK path=$($hit.Path) rule=$($hit.Rule) reason=$($hit.Reason)"
}

if (-not $approvalValid) {
  Write-Error "HIGH_RISK_CONFIRMATION_REQUIRED: sensitive paths cannot be committed as ordinary work. Obtain one Human approval bound to the staged tree."
  exit 3
}

Write-Output "HIGH_RISK_APPROVED: approval is bound to the current staged tree"
exit 0
