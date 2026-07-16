[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Validate", "PlanInfrastructure", "Deploy", "Migrate", "Smoke", "Rollback")]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [ValidateSet("local", "staging", "production")]
  [string]$Environment,

  [string]$ValuesFile = "",
  [string]$TerraformVarFile = "",
  [string]$BackendConfig = "",
  [string]$KubeContext = "",
  [string]$Confirmation = "",
  [string]$RunId = "",
  [int]$Revision = 0,
  [switch]$BackupConfirmed,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$chartRoot = Join-Path $repoRoot "deploy\helm\xlb"
$infraRoot = Join-Path $repoRoot "infra\tencent\terraform"
$releaseName = "xlb-$Environment"
$namespace = "xlb-$Environment"
$script:ToolPaths = $null

function Fail([string]$Message) {
  [Console]::Error.WriteLine("xlb-tke: FAILED - $Message")
  exit 1
}

function Resolve-RepoFile([string]$Candidate, [string]$DefaultRelativePath) {
  $value = if ([string]::IsNullOrWhiteSpace($Candidate)) { $DefaultRelativePath } else { $Candidate }
  $path = if ([IO.Path]::IsPathRooted($value)) { $value } else { Join-Path $repoRoot $value }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Fail "required file not found: $value"
  }
  return (Resolve-Path -LiteralPath $path).Path
}

function Get-ConfirmationToken([string]$RequestedAction, [string]$RequestedEnvironment) {
  $prefix = switch ($RequestedAction) {
    "PlanInfrastructure" { "PLAN-INFRASTRUCTURE" }
    "Deploy" { "DEPLOY-XLB" }
    "Migrate" { "MIGRATE-XLB" }
    "Smoke" { "SMOKE-XLB" }
    "Rollback" { "ROLLBACK-XLB" }
    default { Fail "Validate does not have an apply confirmation token" }
  }
  return "$prefix-$($RequestedEnvironment.ToUpperInvariant())"
}

function Assert-ApplyConfirmation {
  if (-not $Apply) { return }
  $required = Get-ConfirmationToken $Action $Environment
  if ($Confirmation -ne $required) {
    Fail "explicit confirmation required: -Confirmation $required"
  }
}

function Get-ApprovedKubeContext([string]$RequestedEnvironment) {
  $name = "XLB_TKE_$($RequestedEnvironment.ToUpperInvariant())_CONTEXT"
  $approved = [Environment]::GetEnvironmentVariable($name, "Process")
  if ([string]::IsNullOrWhiteSpace($approved) -and $RequestedEnvironment -eq "local") {
    $approved = "kind-xlb-local"
  }
  if ([string]::IsNullOrWhiteSpace($approved)) {
    Fail "approved kube-context is not configured; set $name in the operator environment"
  }
  return $approved
}

function Assert-KubeContextSelection {
  $approved = Get-ApprovedKubeContext $Environment
  if ([string]::IsNullOrWhiteSpace($KubeContext) -or $KubeContext -cne $approved) {
    Fail "kube-context must exactly match the approved $Environment context: $approved"
  }
  return $approved
}

function Assert-CurrentKubeContext([string]$Approved) {
  if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Fail "kubectl is required for an applied cluster action"
  }
  $current = (& kubectl config current-context 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $current -cne $Approved) {
    Fail "current kubectl context must exactly match the approved context: $Approved"
  }
}

function Invoke-StaticCheck([string]$ResolvedValues = "", [switch]$DeploymentReady) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js is required for the TKE static safety gate"
  }
  $arguments = @("scripts/check-tke-delivery-line.mjs")
  if ($ResolvedValues) {
    $arguments += @("--values", $ResolvedValues, "--environment", $Environment)
  }
  if ($DeploymentReady) { $arguments += "--deployment-ready" }
  & node @arguments
  if ($LASTEXITCODE -ne 0) { Fail "TKE delivery-line static safety gate failed" }
}

function Assert-DeploymentReady([string]$ResolvedValues) {
  Invoke-StaticCheck -ResolvedValues $ResolvedValues -DeploymentReady
}

function Assert-PlanInputs {
  if ($Environment -eq "local") {
    Fail "PlanInfrastructure is only supported for staging or production"
  }
  if ([string]::IsNullOrWhiteSpace($TerraformVarFile) -or $TerraformVarFile -like "*.example") {
    Fail "an ignored, reviewed non-example -TerraformVarFile is required"
  }
  if ([string]::IsNullOrWhiteSpace($BackendConfig) -or $BackendConfig -like "*.example") {
    Fail "an ignored, reviewed non-example -BackendConfig is required"
  }
  $resolvedVarFile = Resolve-RepoFile $TerraformVarFile ""
  $resolvedBackend = Resolve-RepoFile $BackendConfig ""
  foreach ($path in @($resolvedVarFile, $resolvedBackend)) {
    $content = Get-Content -LiteralPath $path -Raw
    if ($content -match '(?i)placeholder|example\.invalid|REPLACE_WITH|change-me|<[^>]+>') {
      Fail "reviewed infrastructure input still contains a placeholder marker: $path"
    }
  }

  foreach ($name in @("TENCENTCLOUD_SECRET_ID", "TENCENTCLOUD_SECRET_KEY")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, "Process"))) {
      Fail "$name must be injected into the operator process for an applied infrastructure plan"
    }
  }
}

function Write-DryRun([string]$Description) {
  Write-Host "xlb-tke: dry-run only - $Description"
  Write-Host "xlb-tke: add -Apply and the action-specific confirmation only in an explicitly authorized window"
}

function Get-ToolPaths {
  if ($script:ToolPaths) { return $script:ToolPaths }
  $isWindowsHost = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
  if ($isWindowsHost) {
    $output = @(& (Join-Path $PSScriptRoot "bootstrap-tools.ps1"))
    if ($LASTEXITCODE -ne 0 -or $output.Count -eq 0) { Fail "TKE tool bootstrap failed" }
    $script:ToolPaths = $output[-1] | ConvertFrom-Json
  } else {
    $helm = Get-Command helm -ErrorAction SilentlyContinue
    $kubeconform = Get-Command kubeconform -ErrorAction SilentlyContinue
    if (-not $helm) { Fail "Helm is required; install the pinned version from deploy/tke/tool-versions.json" }
    $script:ToolPaths = [pscustomobject]@{
      helm = $helm.Source
      kubeconform = if ($kubeconform) { $kubeconform.Source } else { "" }
    }
  }
  return $script:ToolPaths
}

function Invoke-HelmValidation {
  $script = Join-Path $chartRoot "scripts\validate.ps1"
  $tools = Get-ToolPaths
  $arguments = @{ HelmPath = $tools.helm }
  if ($tools.kubeconform) { $arguments.KubeconformPath = $tools.kubeconform }
  & $script @arguments
}

function Invoke-TerraformValidation {
  $isWindowsHost = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
  if ($isWindowsHost) {
    & (Join-Path $repoRoot "infra\tencent\validate.ps1")
    return
  }

  if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Fail "Terraform is required for offline infrastructure validation"
  }
  foreach ($arguments in @(
    @("-chdir=$infraRoot", "fmt", "-check", "-recursive"),
    @("-chdir=$infraRoot", "init", "-backend=false", "-input=false", "-no-color"),
    @("-chdir=$infraRoot", "validate", "-no-color"),
    @("-chdir=$infraRoot", "test", "-no-color")
  )) {
    & terraform @arguments
    if ($LASTEXITCODE -ne 0) { Fail "terraform $($arguments -join ' ') failed" }
  }
}

$defaultValues = "deploy\environments\tke\values-$Environment.yaml"
$resolvedValues = Resolve-RepoFile $ValuesFile $defaultValues

Assert-ApplyConfirmation

switch ($Action) {
  "Validate" {
    if ($Apply) { Fail "Validate is always read-only and does not accept -Apply" }
    Invoke-StaticCheck
    Invoke-HelmValidation
    Invoke-TerraformValidation
    Write-Host "xlb-tke: validation passed"
  }

  "PlanInfrastructure" {
    if (-not $Apply) {
      Write-DryRun "would validate reviewed backend/tfvars inputs and run an infrastructure plan for $Environment"
      break
    }
    Assert-PlanInputs
    $varFile = Resolve-RepoFile $TerraformVarFile ""
    $backend = Resolve-RepoFile $BackendConfig ""
    $planRoot = Join-Path $repoRoot ".artifacts\tke\plans"
    [IO.Directory]::CreateDirectory($planRoot) | Out-Null
    $planFile = Join-Path $planRoot "$Environment.tfplan"

    $terraform = "terraform"
    if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
      $bootstrapOutput = @(& (Join-Path $repoRoot "infra\tencent\scripts\bootstrap-terraform.ps1"))
      if ($LASTEXITCODE -ne 0 -or $bootstrapOutput.Count -eq 0) { Fail "Terraform bootstrap failed" }
      $terraform = "$($bootstrapOutput[-1])".Trim()
    }
    & $terraform "-chdir=$infraRoot" init "-backend-config=$backend" -input=false -no-color
    if ($LASTEXITCODE -ne 0) { Fail "Terraform backend initialization failed" }
    & $terraform "-chdir=$infraRoot" plan "-var-file=$varFile" "-out=$planFile" -input=false -no-color
    if ($LASTEXITCODE -ne 0) { Fail "Terraform plan failed" }
    Write-Host "xlb-tke: infrastructure plan written to $planFile; no apply was performed"
  }

  "Deploy" {
    if (-not $Apply) {
      Invoke-StaticCheck
      Write-DryRun "would deploy Helm release $releaseName to namespace $namespace using $resolvedValues"
      break
    }
    $approvedContext = Assert-KubeContextSelection
    Assert-DeploymentReady $resolvedValues
    Assert-CurrentKubeContext $approvedContext
    $tools = Get-ToolPaths
    & $tools.helm upgrade --install $releaseName $chartRoot --namespace $namespace --create-namespace --kube-context $KubeContext -f $resolvedValues --set migration.enabled=false --atomic --wait
    if ($LASTEXITCODE -ne 0) { Fail "Helm deploy failed" }
  }

  "Migrate" {
    if ($RunId -notmatch '^[a-z0-9][a-z0-9-]{5,62}$') {
      Fail "Migrate requires a unique DNS-safe -RunId between 6 and 63 characters"
    }
    if (-not $Apply) {
      Write-DryRun "would render the explicit migration Job for run id $RunId; normal Deploy keeps migration disabled"
      break
    }
    if (-not $BackupConfirmed) { Fail "Migrate -Apply requires -BackupConfirmed" }
    $approvedContext = Assert-KubeContextSelection
    Assert-DeploymentReady $resolvedValues
    Assert-CurrentKubeContext $approvedContext
    $artifactRoot = Join-Path $repoRoot ".artifacts\tke\migrations"
    [IO.Directory]::CreateDirectory($artifactRoot) | Out-Null
    $manifest = Join-Path $artifactRoot "$Environment-$RunId.yaml"
    $tools = Get-ToolPaths
    $rendered = @(& $tools.helm template "xlb-migration" $chartRoot --namespace $namespace -f $resolvedValues --set migration.enabled=true --set-string "migration.runId=$RunId" 2>&1)
    if ($LASTEXITCODE -ne 0) { Fail "migration Job rendering failed: $($rendered -join [Environment]::NewLine)" }
    [IO.File]::WriteAllText($manifest, ($rendered -join [Environment]::NewLine), [Text.UTF8Encoding]::new($false))
    & kubectl --context $KubeContext --namespace $namespace apply -f $manifest
    if ($LASTEXITCODE -ne 0) { Fail "migration Job apply failed" }
  }

  "Smoke" {
    if (-not $Apply) {
      Write-DryRun "would inspect workload readiness and rollout status in $namespace"
      break
    }
    $approvedContext = Assert-KubeContextSelection
    Assert-CurrentKubeContext $approvedContext
    & kubectl --context $KubeContext --namespace $namespace get deployment,pod,service,ingress
    if ($LASTEXITCODE -ne 0) { Fail "cluster smoke inventory failed" }
    foreach ($deployment in @("backend", "customer", "worker", "admin", "jobs")) {
      & kubectl --context $KubeContext --namespace $namespace rollout status "deployment/$releaseName-xlb-$deployment" --timeout=180s
      if ($LASTEXITCODE -ne 0) { Fail "rollout smoke failed for $deployment" }
    }
  }

  "Rollback" {
    if ($Revision -lt 1) { Fail "Rollback requires -Revision greater than zero" }
    if (-not $Apply) {
      Write-DryRun "would rollback Helm release $releaseName to immutable revision $Revision"
      break
    }
    $approvedContext = Assert-KubeContextSelection
    Assert-CurrentKubeContext $approvedContext
    $tools = Get-ToolPaths
    & $tools.helm rollback $releaseName $Revision --namespace $namespace --kube-context $KubeContext --wait
    if ($LASTEXITCODE -ne 0) { Fail "Helm rollback failed" }
  }
}

Write-Host "xlb-tke: $Action completed for $Environment"
