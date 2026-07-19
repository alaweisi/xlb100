[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$bootstrap = Join-Path $repoRoot "deploy\tke\bootstrap-tools.ps1"
$validate = Join-Path $repoRoot "deploy\helm\xlb\scripts\validate.ps1"

$bootstrapOutput = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $bootstrap)
if ($LASTEXITCODE -ne 0) { throw "pinned TKE tool bootstrap failed" }
$toolJson = $bootstrapOutput | Select-Object -Last 1
$tools = $toolJson | ConvertFrom-Json

& powershell -NoProfile -ExecutionPolicy Bypass -File $validate `
  -HelmPath $tools.helm `
  -KubeconformPath $tools.kubeconform
if ($LASTEXITCODE -ne 0) { throw "Unit B Helm edge validation failed" }

Write-Host "check-unit-b-helm: passed"
