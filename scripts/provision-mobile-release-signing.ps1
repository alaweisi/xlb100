param(
  [string]$OutputDirectory = (
    Join-Path ([Environment]::GetFolderPath('UserProfile')) '.xlb100\android-release-signing'
  ),
  [string]$KeytoolPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workspaceRoot = [IO.Path]::GetFullPath((Resolve-Path (Join-Path $PSScriptRoot '..')))
$signingRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($signingRoot.StartsWith($workspaceRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Android release signing assets must remain outside the XLB workspace'
}
if ([string]::IsNullOrWhiteSpace($KeytoolPath)) {
  $keytoolCandidates = @()
  if (-not [string]::IsNullOrWhiteSpace($env:JAVA_HOME)) {
    $keytoolCandidates += Join-Path $env:JAVA_HOME 'bin\keytool.exe'
  }
  $keytoolCommand = Get-Command keytool.exe -ErrorAction SilentlyContinue
  if ($keytoolCommand) {
    $keytoolCandidates += $keytoolCommand.Source
  }
  $adoptiumRoot = Join-Path $env:ProgramFiles 'Eclipse Adoptium'
  if (Test-Path -LiteralPath $adoptiumRoot -PathType Container) {
    $keytoolCandidates += Get-ChildItem -LiteralPath $adoptiumRoot -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\keytool.exe' }
  }
  $KeytoolPath = $keytoolCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
}
if (-not (Test-Path -LiteralPath $KeytoolPath -PathType Leaf)) {
  throw "keytool not found: $KeytoolPath"
}
if (Test-Path -LiteralPath $signingRoot) {
  $existing = @(Get-ChildItem -LiteralPath $signingRoot -Force)
  if ($existing.Count -gt 0) {
    throw "Refusing to overwrite existing signing assets: $signingRoot"
  }
} else {
  [void](New-Item -ItemType Directory -Path $signingRoot)
}

function New-XlbSecret {
  $bytes = New-Object byte[] 32
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Invoke-Keytool {
  param([string[]]$Arguments)

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& $KeytoolPath @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  if ($exitCode -ne 0) {
    throw "keytool failed with exit code $exitCode"
  }
  return $output
}

$roles = @(
  @{
    Name = 'customer'
    Prefix = 'XLB_CUSTOMER_ANDROID'
    AppId = 'com.xlb100.customer'
  },
  @{
    Name = 'worker'
    Prefix = 'XLB_WORKER_ANDROID'
    AppId = 'com.xlb100.worker'
  },
  @{
    Name = 'admin'
    Prefix = 'XLB_ADMIN_ANDROID'
    AppId = 'com.xlb100.admin'
  }
)

$environmentLines = [Collections.Generic.List[string]]::new()
$environmentLines.Add(
  '# XLB Android release signing secrets. Never upload, commit, paste, or share this file.'
)
$environmentLines.Add(
  '# Load only in the current PowerShell process before running the M5 gate.'
)
$fingerprints = @()

foreach ($role in $roles) {
  $storePassword = New-XlbSecret
  $keyPassword = New-XlbSecret
  $alias = "xlb-$($role.Name)-android-release"
  $keystorePath = Join-Path $signingRoot "$($role.Name)-android-release.jks"
  $distinguishedName = (
    "CN=$($role.AppId), OU=Android Release, O=XLB100, C=CN"
  )

  [void](Invoke-Keytool -Arguments @(
    '-genkeypair',
    '-keystore', $keystorePath,
    '-storetype', 'JKS',
    '-storepass', $storePassword,
    '-keypass', $keyPassword,
    '-alias', $alias,
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-sigalg', 'SHA256withRSA',
    '-validity', '10000',
    '-dname', $distinguishedName
  ))

  $environmentLines.Add(
    "`$env:$($role.Prefix)_KEYSTORE_PATH = '$keystorePath'"
  )
  $environmentLines.Add(
    "`$env:$($role.Prefix)_STORE_PASSWORD = '$storePassword'"
  )
  $environmentLines.Add(
    "`$env:$($role.Prefix)_KEY_ALIAS = '$alias'"
  )
  $environmentLines.Add(
    "`$env:$($role.Prefix)_KEY_PASSWORD = '$keyPassword'"
  )

  $listing = Invoke-Keytool -Arguments @(
    '-list',
    '-v',
    '-keystore', $keystorePath,
    '-storepass', $storePassword,
    '-alias', $alias
  )
  $shaLine = $listing |
    Where-Object { $_ -match '^\s*SHA256:' } |
    Select-Object -First 1
  if (-not $shaLine) {
    throw "SHA256 fingerprint missing for $($role.Name)"
  }
  $fingerprints += [pscustomobject]@{
    Role = $role.Name
    Alias = $alias
    CertificateSHA256 = ($shaLine -replace '^\s*SHA256:\s*', '')
    Keystore = $keystorePath
  }
}

$utf8WithoutBom = [Text.UTF8Encoding]::new($false)
$environmentPath = Join-Path $signingRoot 'signing-environment.ps1'
[IO.File]::WriteAllLines(
  $environmentPath,
  $environmentLines,
  $utf8WithoutBom
)

$notice = @(
  'XLB100 Android long-term release signing assets',
  '',
  'This directory contains the long-term private signing keys and passwords.',
  'Never upload, commit, paste, or share any file from this directory.',
  'Keep at least two copies on separate encrypted offline storage devices.',
  'Losing or replacing a key prevents in-place updates after publication.',
  '',
  "Generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))"
)
[IO.File]::WriteAllLines(
  (Join-Path $signingRoot 'DO-NOT-DELETE-BACKUP-INSTRUCTIONS.txt'),
  $notice,
  $utf8WithoutBom
)
$fingerprints |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (
    Join-Path $signingRoot 'certificate-fingerprints.json'
  ) -Encoding UTF8

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $signingRoot `
  /inheritance:r `
  /grant:r "${currentIdentity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' `
  /C |
  Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to restrict the Android signing directory ACL'
}
& icacls.exe (Join-Path $signingRoot '*') `
  /inheritance:r `
  /grant:r "${currentIdentity}:F" 'SYSTEM:F' `
  /T `
  /C |
  Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to restrict Android signing asset ACLs'
}

[pscustomobject]@{
  SigningRoot = $signingRoot
  KeystoreCount = $fingerprints.Count
  EnvironmentFile = $environmentPath
  FingerprintsDistinct = (
    @($fingerprints.CertificateSHA256 | Sort-Object -Unique).Count -eq 3
  )
}
$fingerprints | Select-Object Role, Alias, CertificateSHA256
