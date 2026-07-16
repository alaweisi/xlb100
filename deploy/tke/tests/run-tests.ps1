[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$entry = Join-Path $repoRoot "deploy\tke\xlb-tke.ps1"
$shell = if ($PSVersionTable.PSEdition -eq "Core") {
  Join-Path $PSHOME "pwsh.exe"
} else {
  Join-Path $PSHOME "powershell.exe"
}

if (-not (Test-Path -LiteralPath $shell -PathType Leaf)) {
  $shell = if ($PSVersionTable.PSEdition -eq "Core") { "pwsh" } else { "powershell" }
}

function Invoke-Entry([string[]]$Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell promotes native stderr to non-terminating error
    # records. Negative tests intentionally exercise stderr and decide from
    # the child exit code instead.
    $ErrorActionPreference = "Continue"
    $output = @(& $shell -NoProfile -File $entry @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Text = $output -join [Environment]::NewLine
  }
}

function Assert-Fails([string]$Name, [string[]]$Arguments, [string]$Pattern) {
  $result = Invoke-Entry $Arguments
  if ($result.ExitCode -eq 0) { throw "$Name unexpectedly succeeded" }
  if ($result.Text -notmatch $Pattern) {
    throw "$Name failed for the wrong reason. Expected /$Pattern/, got:`n$($result.Text)"
  }
  Write-Host "tke-tooling: negative check passed - $Name"
}

function Assert-Passes([string]$Name, [string[]]$Arguments, [string]$Pattern) {
  $result = Invoke-Entry $Arguments
  if ($result.ExitCode -ne 0) { throw "$Name failed:`n$($result.Text)" }
  if ($result.Text -notmatch $Pattern) { throw "$Name output did not match /$Pattern/" }
  Write-Host "tke-tooling: positive check passed - $Name"
}

Assert-Fails "unknown environment" @("-Action", "Deploy", "-Environment", "qa") "ValidateSet"

$saved = [Environment]::GetEnvironmentVariable("XLB_TKE_PRODUCTION_CONTEXT", "Process")
try {
  [Environment]::SetEnvironmentVariable("XLB_TKE_PRODUCTION_CONTEXT", "tke-production-approved", "Process")
  Assert-Fails "missing confirmation" @(
    "-Action", "Deploy", "-Environment", "production", "-Apply",
    "-KubeContext", "tke-production-approved"
  ) "explicit confirmation required"
  Assert-Fails "wrong kube context" @(
    "-Action", "Deploy", "-Environment", "production", "-Apply",
    "-KubeContext", "tke-production-wrong", "-Confirmation", "DEPLOY-XLB-PRODUCTION"
  ) "must exactly match"
  Assert-Fails "committed production placeholders cannot be applied" @(
    "-Action", "Deploy", "-Environment", "production", "-Apply",
    "-KubeContext", "tke-production-approved", "-Confirmation", "DEPLOY-XLB-PRODUCTION"
  ) "forbidden placeholder"
} finally {
  [Environment]::SetEnvironmentVariable("XLB_TKE_PRODUCTION_CONTEXT", $saved, "Process")
}

Assert-Fails "missing approved staging context" @(
  "-Action", "Smoke", "-Environment", "staging", "-Apply",
  "-KubeContext", "anything", "-Confirmation", "SMOKE-XLB-STAGING"
) "approved kube-context is not configured"

Assert-Fails "migration run id required" @(
  "-Action", "Migrate", "-Environment", "staging"
) "unique DNS-safe"

Assert-Fails "migration backup attestation required" @(
  "-Action", "Migrate", "-Environment", "local", "-Apply",
  "-RunId", "release-001", "-KubeContext", "kind-xlb-local",
  "-Confirmation", "MIGRATE-XLB-LOCAL"
) "BackupConfirmed"

Assert-Fails "rollback revision required" @(
  "-Action", "Rollback", "-Environment", "staging"
) "Revision greater than zero"

$tempVarFile = [IO.Path]::GetTempFileName()
$tempBackend = [IO.Path]::GetTempFileName()
try {
  Copy-Item -LiteralPath (Join-Path $repoRoot "infra\tencent\terraform\environments\staging.tfvars.example") -Destination $tempVarFile -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot "infra\tencent\terraform\environments\staging.backend.hcl.example") -Destination $tempBackend -Force
  Assert-Fails "infrastructure placeholder content rejected" @(
    "-Action", "PlanInfrastructure", "-Environment", "staging", "-Apply",
    "-TerraformVarFile", $tempVarFile, "-BackendConfig", $tempBackend,
    "-Confirmation", "PLAN-INFRASTRUCTURE-STAGING"
  ) "placeholder marker"
} finally {
  Remove-Item -LiteralPath $tempVarFile, $tempBackend -Force -ErrorAction SilentlyContinue
}

Assert-Passes "deploy defaults to dry-run" @(
  "-Action", "Deploy", "-Environment", "staging"
) "dry-run only"
Assert-Passes "infrastructure plan defaults to dry-run" @(
  "-Action", "PlanInfrastructure", "-Environment", "staging"
) "dry-run only"
Assert-Passes "migration defaults to dry-run" @(
  "-Action", "Migrate", "-Environment", "staging", "-RunId", "release-001"
) "dry-run only"
Assert-Passes "smoke defaults to dry-run" @(
  "-Action", "Smoke", "-Environment", "staging"
) "dry-run only"
Assert-Passes "rollback defaults to dry-run" @(
  "-Action", "Rollback", "-Environment", "staging", "-Revision", "1"
) "dry-run only"

$isWindowsHost = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
if ($isWindowsHost) {
  $bootstrapOutput = @(& (Join-Path $repoRoot "deploy\tke\bootstrap-tools.ps1"))
  if ($bootstrapOutput.Count -eq 0) { throw "TKE tool bootstrap produced no output" }
  $helm = ($bootstrapOutput[-1] | ConvertFrom-Json).helm
} else {
  $helmCommand = Get-Command helm -ErrorAction SilentlyContinue
  if (-not $helmCommand) { throw "Helm is required for the isolated migration rendering test" }
  $helm = $helmCommand.Source
}

$chartRoot = Join-Path $repoRoot "deploy\helm\xlb"
$values = Join-Path $repoRoot "deploy\environments\tke\values-staging.yaml"
$rendered = @(& $helm template "xlb-staging" $chartRoot --namespace "xlb-staging" -f $values --set migration.enabled=true --set-string migration.runId=release-001 --show-only "templates/migration-job.yaml" 2>&1)
if ($LASTEXITCODE -ne 0) { throw "isolated migration rendering failed: $($rendered -join [Environment]::NewLine)" }
$manifest = $rendered -join [Environment]::NewLine
if ([regex]::Matches($manifest, '(?m)^kind:\s+Job\s*$').Count -ne 1) {
  throw "isolated migration rendering must contain exactly one Job"
}
if ($manifest -match '(?m)^kind:\s+(Deployment|Service|ConfigMap)\s*$') {
  throw "isolated migration rendering must not contain application Deployments, Services or ConfigMaps"
}
if ($manifest -notmatch 'configMapRef:\s*[\r\n]+\s+name:\s+xlb-staging-xlb-backend') {
  throw "migration Job must reference the installed release backend ConfigMap"
}
Write-Host "tke-tooling: isolated migration Job rendering passed"

Write-Host "tke-tooling: PowerShell entry tests passed"
