[CmdletBinding()]
param(
  [switch]$Refresh
)

$ErrorActionPreference = "Stop"
$version = "1.15.8"
$archiveName = "terraform_${version}_windows_amd64.zip"
$expectedSha256 = "2ff41d2129afb1982733c132c61a8d6ef038f879f3aeede7fc28b8b8b24acf02"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$toolRoot = Join-Path $root ".artifacts\tools\terraform\$version\windows-amd64"
$terraform = Join-Path $toolRoot "terraform.exe"
$archive = Join-Path $toolRoot $archiveName

if ($Refresh -and (Test-Path -LiteralPath $toolRoot)) {
  $resolvedToolRoot = (Resolve-Path -LiteralPath $toolRoot).Path
  $resolvedArtifacts = (Resolve-Path -LiteralPath (Join-Path $root ".artifacts")).Path
  if (-not $resolvedToolRoot.StartsWith($resolvedArtifacts + "\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to refresh a tool path outside .artifacts: $resolvedToolRoot"
  }
  Remove-Item -LiteralPath $resolvedToolRoot -Recurse -Force
}

if (-not (Test-Path -LiteralPath $terraform -PathType Leaf)) {
  [IO.Directory]::CreateDirectory($toolRoot) | Out-Null
  $uri = "https://releases.hashicorp.com/terraform/$version/$archiveName"
  Write-Host "tke-infra: downloading Terraform $version from releases.hashicorp.com"
  Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $archive
  $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $expectedSha256) {
    Remove-Item -LiteralPath $archive -Force
    throw "Terraform archive checksum mismatch: expected $expectedSha256, got $actualSha256"
  }
  Expand-Archive -LiteralPath $archive -DestinationPath $toolRoot -Force
  Remove-Item -LiteralPath $archive -Force
}

$reportedVersion = (& $terraform version -json | ConvertFrom-Json).terraform_version
if ($reportedVersion -ne $version) {
  throw "Unexpected Terraform version: expected $version, got $reportedVersion"
}

Write-Output $terraform
