[CmdletBinding()]
param(
  [switch]$Refresh
)

$ErrorActionPreference = "Stop"
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw "bootstrap-tools.ps1 currently bootstraps Windows amd64 tools; CI installs the same pinned versions with setup actions"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$versions = Get-Content -LiteralPath (Join-Path $PSScriptRoot "tool-versions.json") -Raw | ConvertFrom-Json
$toolRoot = Join-Path $repoRoot ".artifacts\tools\tke-delivery-line"

function Install-ZipTool(
  [string]$Name,
  [string]$Version,
  [string]$Uri,
  [string]$ExpectedExecutableSha256,
  [string]$ExecutableRelativePath
) {
  $destination = Join-Path $toolRoot "$Name\$Version\windows-amd64"
  $executable = Join-Path $destination $ExecutableRelativePath
  $archive = Join-Path $destination "$Name.zip"

  if ($Refresh -and (Test-Path -LiteralPath $destination)) {
    $resolvedDestination = (Resolve-Path -LiteralPath $destination).Path
    $resolvedToolRoot = if (Test-Path -LiteralPath $toolRoot) { (Resolve-Path -LiteralPath $toolRoot).Path } else { $toolRoot }
    if (-not $resolvedDestination.StartsWith($resolvedToolRoot + "\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "refusing to refresh a path outside the TKE tool cache: $resolvedDestination"
    }
    Remove-Item -LiteralPath $resolvedDestination -Recurse -Force
  }

  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Write-Host "tke-tools: downloading pinned $Name $Version"
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force
    Remove-Item -LiteralPath $archive -Force
  }

  $actual = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $ExpectedExecutableSha256.ToLowerInvariant()) {
    throw "$Name executable checksum mismatch: expected $ExpectedExecutableSha256, got $actual"
  }
  return $executable
}

$helm = Install-ZipTool `
  -Name "helm" `
  -Version $versions.helm.version `
  -Uri $versions.helm.windowsAmd64Url `
  -ExpectedExecutableSha256 $versions.helm.executableSha256 `
  -ExecutableRelativePath "windows-amd64\helm.exe"

$kubeconform = Install-ZipTool `
  -Name "kubeconform" `
  -Version $versions.kubeconform.version `
  -Uri $versions.kubeconform.windowsAmd64Url `
  -ExpectedExecutableSha256 $versions.kubeconform.executableSha256 `
  -ExecutableRelativePath "kubeconform.exe"

$helmVersion = (& $helm version --short).Trim()
if ($helmVersion -notmatch [regex]::Escape("v$($versions.helm.version)")) {
  throw "unexpected Helm version: $helmVersion"
}
$kubeconformVersion = (& $kubeconform -v).Trim()
if ($kubeconformVersion -notmatch [regex]::Escape("v$($versions.kubeconform.version)")) {
  throw "unexpected kubeconform version: $kubeconformVersion"
}

[pscustomobject]@{
  helm = $helm
  kubeconform = $kubeconform
} | ConvertTo-Json -Compress
