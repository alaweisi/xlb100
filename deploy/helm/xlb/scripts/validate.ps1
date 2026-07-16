[CmdletBinding()]
param(
  [string]$HelmPath = "helm",
  [string]$KubeconformPath = ""
)

$ErrorActionPreference = "Stop"
$chartRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $chartRoot "..\..\..")).Path
$environmentRoot = Join-Path $repoRoot "deploy\environments\tke"
$values = [ordered]@{
  local = Join-Path $environmentRoot "values-local.yaml"
  staging = Join-Path $environmentRoot "values-staging.yaml"
  production = Join-Path $environmentRoot "values-production.yaml"
}

function Invoke-Helm([string[]]$Arguments, [switch]$Capture) {
  if ($Capture) {
    $output = @(& $HelmPath @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
      throw "helm $($Arguments -join ' ') failed:`n$($output -join [Environment]::NewLine)"
    }
    return $output -join [Environment]::NewLine
  }

  & $HelmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "helm $($Arguments -join ' ') failed"
  }
}

function Assert-Contains([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains([string]$Text, [string]$Pattern, [string]$Message) {
  if ($Text -match $Pattern) { throw $Message }
}

function Assert-TemplateFails([string]$Name, [string[]]$Overrides) {
  $args = @(
    "template", "xlb-negative", $chartRoot,
    "--namespace", "xlb-production",
    "-f", $values.production
  ) + $Overrides
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Windows PowerShell promotes native stderr records to non-terminating
    # errors. Negative tests need the native exit code, not PowerShell's error
    # stream policy, to decide whether Helm correctly rejected the values.
    $ErrorActionPreference = "Continue"
    $output = @(& $HelmPath @args 2>&1)
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($LASTEXITCODE -eq 0) {
    throw "negative validation unexpectedly succeeded: $Name"
  }
  Write-Host "helm-chart: negative check passed - $Name"
}

foreach ($entry in $values.GetEnumerator()) {
  if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) {
    throw "missing values file: $($entry.Value)"
  }
  Write-Host "helm-chart: linting $($entry.Key)"
  Invoke-Helm @("lint", $chartRoot, "--strict", "-f", $entry.Value)
}

$rendered = @{}
foreach ($entry in $values.GetEnumerator()) {
  Write-Host "helm-chart: rendering $($entry.Key)"
  $rendered[$entry.Key] = Invoke-Helm @(
    "template", "xlb-$($entry.Key)", $chartRoot,
    "--namespace", "xlb-$($entry.Key)",
    "-f", $entry.Value
  ) -Capture

  Assert-NotContains $rendered[$entry.Key] '(?m)^kind:\s+Secret\s*$' `
    "$($entry.Key) render must not create runtime Secrets"
  Assert-NotContains $rendered[$entry.Key] '(?m)^kind:\s+Job\s*$' `
    "$($entry.Key) normal render must not create a migration Job"

  $deploymentCount = [regex]::Matches($rendered[$entry.Key], '(?m)^kind:\s+Deployment\s*$').Count
  if ($deploymentCount -ne 5) {
    throw "$($entry.Key) must render exactly five Deployments; got $deploymentCount"
  }
}

Assert-Contains $rendered.local 'image:\s+"xlb/backend:local"' `
  "local render must allow the local backend tag"
Assert-Contains $rendered.production 'path:\s+/health/live' `
  "production render is missing the liveness endpoint"
Assert-Contains $rendered.production 'path:\s+/health/ready' `
  "production render is missing the readiness endpoint"
Assert-Contains $rendered.production 'type:\s+Recreate' `
  "jobs Deployment must use Recreate to preserve singleton handover"
Assert-Contains $rendered.production '@sha256:0{64}' `
  "production render must use digest-form images"
Assert-NotContains $rendered.production 'image:\s+[^\r\n]+:latest' `
  "production render must not contain latest tags"
Assert-Contains $rendered.production 'XLB_COS_SECRET_ID_FILE' `
  "production render must mount COS credentials by file"

$pdbCount = [regex]::Matches($rendered.production, '(?m)^kind:\s+PodDisruptionBudget\s*$').Count
if ($pdbCount -ne 4) {
  throw "production must render four PodDisruptionBudgets; got $pdbCount"
}

$optional = Invoke-Helm @(
  "template", "xlb-production", $chartRoot,
  "--namespace", "xlb-production",
  "-f", $values.production,
  "--set", "autoscaling.backend.enabled=true",
  "--set", "autoscaling.frontends.enabled=true",
  "--set", "serviceMonitor.enabled=true",
  "--set", "networkPolicy.enabled=true"
) -Capture
$hpaCount = [regex]::Matches($optional, '(?m)^kind:\s+HorizontalPodAutoscaler\s*$').Count
if ($hpaCount -ne 4) {
  throw "optional render must contain four HorizontalPodAutoscalers; got $hpaCount"
}
Assert-Contains $optional '(?m)^kind:\s+NetworkPolicy\s*$' `
  "optional render is missing NetworkPolicy"
Assert-Contains $optional '(?m)^kind:\s+ServiceMonitor\s*$' `
  "optional render is missing ServiceMonitor"

if ($KubeconformPath) {
  $schemaInput = Join-Path ([IO.Path]::GetTempPath()) "xlb-helm-schema-$PID.yaml"
  try {
    [IO.File]::WriteAllText($schemaInput, $optional, [Text.UTF8Encoding]::new($false))
    & $KubeconformPath -strict -summary -ignore-missing-schemas `
      -kubernetes-version 1.34.0 $schemaInput
    if ($LASTEXITCODE -ne 0) { throw "kubeconform validation failed" }
  } finally {
    Remove-Item -LiteralPath $schemaInput -Force -ErrorAction SilentlyContinue
  }
}

$migration = Invoke-Helm @(
  "template", "xlb-migration", $chartRoot,
  "--namespace", "xlb-production",
  "-f", $values.production,
  "--set", "migration.enabled=true",
  "--set-string", "migration.runId=validate-001"
) -Capture
Assert-Contains $migration '(?m)^kind:\s+Job\s*$' `
  "explicit migration render must create a Job"
Assert-Contains $migration 'xlb-migration-xlb-migration-validate-001' `
  "migration Job must include its unique run id"

Assert-TemplateFails "production backend digest required" @(
  "--set-string", "backend.image.digest="
)
Assert-TemplateFails "staging backend digest required" @(
  "--set-string", "global.environment=staging",
  "--set-string", "backend.image.digest="
)
Assert-TemplateFails "production frontend digest required" @(
  "--set-string", "frontends.customer.image.digest="
)
Assert-TemplateFails "production backend high availability required" @(
  "--set", "backend.replicaCount=1"
)
Assert-TemplateFails "production frontend high availability required" @(
  "--set", "frontends.customer.replicaCount=1"
)
Assert-TemplateFails "production COS required" @(
  "--set-string", "config.objectStorage.provider=local"
)
Assert-TemplateFails "production jobs singleton required" @(
  "--set", "jobs.replicaCount=2"
)
Assert-TemplateFails "production TLS required" @(
  "--set", "ingress.tls.enabled=false"
)
Assert-TemplateFails "runtime Secret reference required" @(
  "--set-string", "runtimeSecrets.existingSecret="
)

Write-Host "helm-chart: validation passed"
