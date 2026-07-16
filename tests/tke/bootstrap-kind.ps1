[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "tool-versions.json") -Raw | ConvertFrom-Json
$isWindowsHost = [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::Windows)
$isMacHost = [Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([Runtime.InteropServices.OSPlatform]::OSX)
$os = if ($isWindowsHost) { "windows" } elseif ($isMacHost) { "darwin" } else { "linux" }
$arch = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
if ($arch -eq "x64") { $arch = "amd64" }
if ($arch -eq "arm64") { $arch = "arm64" }
$assetKey = "$os-$arch"
$asset = $manifest.kind.assets.PSObject.Properties[$assetKey].Value
if (-not $asset) { throw "kind is not pinned for platform $assetKey" }

$cacheRoot = Join-Path $repoRoot ".artifacts\tke-acceptance\tools\kind\$($manifest.kind.version)"
[IO.Directory]::CreateDirectory($cacheRoot) | Out-Null
$extension = if ($os -eq "windows") { ".exe" } else { "" }
$target = Join-Path $cacheRoot "kind$extension"
$url = "https://github.com/kubernetes-sigs/kind/releases/download/$($manifest.kind.version)/$($asset.name)"

function Assert-Checksum([string]$Path) {
  $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $asset.sha256) {
    throw "kind checksum mismatch: expected $($asset.sha256), received $actual"
  }
}

if (Test-Path -LiteralPath $target) {
  try { Assert-Checksum $target } catch { Remove-Item -LiteralPath $target -Force }
}
if (-not (Test-Path -LiteralPath $target)) {
  $download = "$target.download"
  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
  Invoke-WebRequest -Uri $url -OutFile $download
  Assert-Checksum $download
  Move-Item -LiteralPath $download -Destination $target
}
Assert-Checksum $target
if ($os -ne "windows") { & chmod +x $target }

Write-Output $target
