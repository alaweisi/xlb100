[CmdletBinding()]
param(
  [switch]$RefreshTerraform
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$terraformRoot = Join-Path $PSScriptRoot "terraform"
$bootstrap = Join-Path $PSScriptRoot "scripts\bootstrap-terraform.ps1"

if (-not (Test-Path -LiteralPath $terraformRoot -PathType Container)) {
  throw "Terraform root not found: $terraformRoot"
}

$bootstrapArguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $bootstrap)
if ($RefreshTerraform) { $bootstrapArguments += "-Refresh" }
$bootstrapOutput = @(& powershell @bootstrapArguments)
$terraform = if ($bootstrapOutput.Count -gt 0) { "$($bootstrapOutput[-1])".Trim() } else { "" }
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $terraform -PathType Leaf)) {
  throw "Unable to bootstrap the pinned Terraform CLI"
}

$artifactRoot = Join-Path $root ".artifacts\terraform\tke-infra"
$env:TF_DATA_DIR = Join-Path $artifactRoot "data"
$env:TF_PLUGIN_CACHE_DIR = Join-Path $artifactRoot "plugin-cache"
[IO.Directory]::CreateDirectory($env:TF_DATA_DIR) | Out-Null
[IO.Directory]::CreateDirectory($env:TF_PLUGIN_CACHE_DIR) | Out-Null

$credentialNames = @(
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENTCLOUD_SECURITY_TOKEN"
)
$savedCredentials = @{}

try {
  foreach ($name in $credentialNames) {
    $savedCredentials[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }

  Write-Host "tke-infra: checking Terraform formatting"
  & $terraform "-chdir=$terraformRoot" fmt -check -recursive
  if ($LASTEXITCODE -ne 0) { throw "terraform fmt -check failed" }

  Write-Host "tke-infra: initializing providers without a state backend"
  & $terraform "-chdir=$terraformRoot" init -backend=false -input=false -no-color
  if ($LASTEXITCODE -ne 0) { throw "terraform init -backend=false failed" }

  Write-Host "tke-infra: validating configuration"
  & $terraform "-chdir=$terraformRoot" validate -no-color
  if ($LASTEXITCODE -ne 0) { throw "terraform validate failed" }

  Write-Host "tke-infra: running mocked plans without Tencent Cloud credentials"
  & $terraform "-chdir=$terraformRoot" test -no-color
  if ($LASTEXITCODE -ne 0) { throw "terraform test failed" }
} finally {
  foreach ($name in $credentialNames) {
    [Environment]::SetEnvironmentVariable($name, $savedCredentials[$name], "Process")
  }
}

Write-Host "tke-infra: offline validation passed"
