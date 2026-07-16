[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Validate", "ReleaseImages", "GenerateCloudBundle", "VerifySafetyEvidence", "PrepareCutover", "PrepareStaging", "PrepareProduction", "PlanInfrastructure", "Deploy", "Migrate", "Smoke", "Rollback")]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [ValidateSet("local", "staging", "production")]
  [string]$Environment,

  [string]$ValuesFile = "",
  [string]$TerraformVarFile = "",
  [string]$BackendConfig = "",
  [string]$StagingManifest = "",
  [string]$ProductionManifest = "",
  [string]$ReleaseInput = "",
  [ValidateSet("plan", "build", "publish", "freeze")]
  [string]$ImageReleaseMode = "plan",
  [string]$CloudBundleInput = "",
  [string]$CloudBundleOutput = "",
  [string]$ReleaseManifest = "",
  [string]$GuardInput = "",
  [string]$GuardOutput = "",
  [string]$GuardReport = "",
  [string]$GuardNow = "",
  [string]$CutoverRequest = "",
  [string]$CutoverPlanOutput = "",
  [string]$EvidenceRoot = "",
  [string]$KubeContext = "",
  [string]$Confirmation = "",
  [string]$RunId = "",
  [int]$Revision = 0,
  [switch]$BackupConfirmed,
  [switch]$ExecutePlan,
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

function Assert-JsonEnvironment([string]$Path, [string]$Label) {
  try {
    $document = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    Fail "$Label must contain valid JSON"
  }
  if ([string]::IsNullOrWhiteSpace($document.environment) -or $document.environment -cne $Environment) {
    Fail "$Label environment must exactly match -Environment $Environment"
  }
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
  if ($Action -eq "ReleaseImages") {
    if ($ImageReleaseMode -notin @("publish", "freeze")) {
      Fail "ReleaseImages -Apply is only valid for publish or freeze"
    }
    if ([string]::IsNullOrWhiteSpace($Confirmation)) {
      Fail "ReleaseImages publish/freeze requires the release-scoped confirmation token"
    }
    return
  }
  $required = Get-ConfirmationToken $Action $Environment
  if ($Confirmation -ne $required) {
    Fail "explicit confirmation required: -Confirmation $required"
  }
}

function Assert-PlanExecutionConfirmation {
  if (-not $ExecutePlan) { return }
  $required = Get-ConfirmationToken "PlanInfrastructure" $Environment
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

function Write-DryRun([string]$Description, [string]$ExecutionSwitch = "-Apply") {
  Write-Host "xlb-tke: dry-run only - $Description"
  Write-Host "xlb-tke: add $ExecutionSwitch and the action-specific confirmation only in an explicitly authorized window"
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

if ($ExecutePlan -and $Action -ne "PlanInfrastructure") {
  Fail "-ExecutePlan is only valid with PlanInfrastructure"
}
if ($Apply -and $Action -eq "PlanInfrastructure") {
  Fail "PlanInfrastructure never accepts -Apply; use -ExecutePlan only after real-cloud plan authorization"
}
if (($Apply -or $ExecutePlan) -and $Action -in @("GenerateCloudBundle", "VerifySafetyEvidence", "PrepareCutover", "PrepareStaging", "PrepareProduction")) {
  Fail "$Action is always offline and never accepts -Apply or -ExecutePlan"
}
if ($Action -eq "ReleaseImages" -and $ImageReleaseMode -in @("publish", "freeze") -and -not $Apply) {
  Fail "ReleaseImages $ImageReleaseMode requires -Apply and the release-scoped confirmation token"
}
Assert-ApplyConfirmation

switch ($Action) {
  "Validate" {
    if ($Apply) { Fail "Validate is always read-only and does not accept -Apply" }
    Invoke-StaticCheck
    Invoke-HelmValidation
    Invoke-TerraformValidation
    Write-Host "xlb-tke: validation passed"
  }

  "ReleaseImages" {
    if ([string]::IsNullOrWhiteSpace($ReleaseInput)) {
      Fail "ReleaseImages requires an ignored -ReleaseInput under .artifacts"
    }
    $inputFile = Resolve-RepoFile $ReleaseInput ""
    Assert-JsonEnvironment $inputFile "ReleaseInput"
    $arguments = @(
      (Join-Path $repoRoot "deploy\tke\release\image-release.mjs"),
      "--input", $inputFile,
      "--mode", $ImageReleaseMode
    )
    if (-not [string]::IsNullOrWhiteSpace($Confirmation)) {
      $arguments += @("--confirmation", $Confirmation)
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { Fail "image release factory failed" }
  }

  "GenerateCloudBundle" {
    if ([string]::IsNullOrWhiteSpace($CloudBundleInput)) {
      Fail "GenerateCloudBundle requires an ignored -CloudBundleInput under .artifacts"
    }
    $inputFile = Resolve-RepoFile $CloudBundleInput ""
    Assert-JsonEnvironment $inputFile "CloudBundleInput"
    $arguments = @(
      (Join-Path $repoRoot "deploy\tke\bundle\generate-cloud-bundle.mjs"),
      "--manifest", $inputFile
    )
    if (-not [string]::IsNullOrWhiteSpace($CloudBundleOutput)) {
      $arguments += @("--output", $CloudBundleOutput)
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { Fail "cloud bundle generation failed" }
  }

  "VerifySafetyEvidence" {
    foreach ($required in @(
      @{ Name = "ReleaseManifest"; Value = $ReleaseManifest },
      @{ Name = "GuardInput"; Value = $GuardInput },
      @{ Name = "GuardOutput"; Value = $GuardOutput },
      @{ Name = "GuardReport"; Value = $GuardReport }
    )) {
      if ([string]::IsNullOrWhiteSpace($required.Value)) {
        Fail "VerifySafetyEvidence requires -$($required.Name) under .artifacts"
      }
    }
    $manifestFile = Resolve-RepoFile $ReleaseManifest ""
    Assert-JsonEnvironment $manifestFile "ReleaseManifest"
    $inputFile = Resolve-RepoFile $GuardInput ""
    $arguments = @(
      (Join-Path $repoRoot "deploy\tke\guards\safety-guard.mjs"),
      "--manifest", $manifestFile,
      "--input", $inputFile,
      "--output", $GuardOutput,
      "--report", $GuardReport
    )
    if (-not [string]::IsNullOrWhiteSpace($GuardNow)) {
      $arguments += @("--now", $GuardNow)
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { Fail "safety evidence verification failed" }
  }

  "PrepareCutover" {
    if ($Environment -eq "local") { Fail "PrepareCutover is only supported for staging or production" }
    if ([string]::IsNullOrWhiteSpace($CutoverRequest) -or [string]::IsNullOrWhiteSpace($CutoverPlanOutput)) {
      Fail "PrepareCutover requires -CutoverRequest and -CutoverPlanOutput under .artifacts"
    }
    $requestFile = Resolve-RepoFile $CutoverRequest ""
    Assert-JsonEnvironment $requestFile "CutoverRequest"
    & node (Join-Path $repoRoot "deploy\tke\cutover\cutover-controller.mjs") `
      "--request" $requestFile `
      "--output" $CutoverPlanOutput
    if ($LASTEXITCODE -ne 0) { Fail "offline traffic cutover plan preparation failed" }
  }

  "PrepareStaging" {
    if ($Environment -ne "staging") { Fail "PrepareStaging is only supported for staging" }
    if ([string]::IsNullOrWhiteSpace($StagingManifest)) {
      Fail "PrepareStaging requires an ignored -StagingManifest under .artifacts"
    }
    $manifest = Resolve-RepoFile $StagingManifest ""
    $arguments = @(
      (Join-Path $repoRoot "deploy\tke\prepare-staging-plan.mjs"),
      "--manifest", $manifest
    )
    if (-not [string]::IsNullOrWhiteSpace($EvidenceRoot)) {
      $arguments += @("--output", $EvidenceRoot)
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { Fail "N7 offline staging preparation failed" }
  }

  "PrepareProduction" {
    if ($Environment -ne "production") { Fail "PrepareProduction is only supported for production" }
    if ([string]::IsNullOrWhiteSpace($ProductionManifest)) {
      Fail "PrepareProduction requires an ignored -ProductionManifest under .artifacts"
    }
    $manifest = Resolve-RepoFile $ProductionManifest ""
    $arguments = @(
      (Join-Path $repoRoot "deploy\tke\prepare-production-plan.mjs"),
      "--manifest", $manifest
    )
    if (-not [string]::IsNullOrWhiteSpace($EvidenceRoot)) {
      $arguments += @("--output", $EvidenceRoot)
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { Fail "N8 offline production preparation failed" }
  }

  "PlanInfrastructure" {
    if (-not $ExecutePlan) {
      Write-DryRun "would validate reviewed backend/tfvars inputs and run an infrastructure plan for $Environment" "-ExecutePlan"
      break
    }
    Assert-PlanExecutionConfirmation
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
    $rendered = @(& $tools.helm template $releaseName $chartRoot --namespace $namespace -f $resolvedValues --set migration.enabled=true --set-string "migration.runId=$RunId" --show-only "templates/migration-job.yaml" 2>&1)
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
