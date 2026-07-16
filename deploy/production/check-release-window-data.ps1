param(
  [Parameter(Mandatory = $true)][string]$EnvFile,
  [Parameter(Mandatory = $true)][string]$ExpectedCommit,
  [string]$Confirmation = "",
  [switch]$QuietWindowConfirmed
)

$ErrorActionPreference = "Stop"
$requiredConfirmation = "RELEASE-WINDOW-READ-ONLY"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envPath = if ([IO.Path]::IsPathRooted($EnvFile)) { $EnvFile } else { Join-Path $root $EnvFile }

function Fail([string]$Message) { throw "check-release-window-data: $Message" }

if ($EnvFile -like "*.example" -or -not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  Fail "a real production env file is required"
}
if ($Confirmation -ne $requiredConfirmation) {
  Fail "explicit confirmation required: -Confirmation $requiredConfirmation"
}
if (-not $QuietWindowConfirmed) {
  Fail "operator must attest that application/test/migration writers are quiesced with -QuietWindowConfirmed"
}
if ($ExpectedCommit -notmatch '^[a-fA-F0-9]{40}$') { Fail "ExpectedCommit must be a full Git SHA" }

$head = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedCommit) {
  Fail "HEAD $head does not match expected release commit $ExpectedCommit"
}
$dirty = @(& git -C $root status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
  Fail "tracked workspace must be clean for release-window evidence"
}

$previous = @{}
$loadedNames = [Collections.Generic.List[string]]::new()
try {
  Get-Content -LiteralPath $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line -split '=', 2
    $name = $parts[0].Trim()
    if ($parts.Count -ne 2 -or $name -notmatch '^[A-Z][A-Z0-9_]*$') {
      Fail "invalid environment entry"
    }
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $parts[1].Trim().Trim('"').Trim("'"), 'Process')
    $loadedNames.Add($name)
  }
  $secretMappings = @{
    MYSQL_PASSWORD_SECRET_FILE = 'MYSQL_PASSWORD_FILE'
    MYSQL_TLS_CA_SECRET_FILE = 'MYSQL_TLS_CA_FILE'
    REDIS_PASSWORD_SECRET_FILE = 'REDIS_PASSWORD_FILE'
    REDIS_TLS_CA_SECRET_FILE = 'REDIS_TLS_CA_FILE'
    JWT_KEYS_JSON_SECRET_FILE = 'JWT_KEYS_JSON_FILE'
    AUTH_PHONE_HASH_SECRET_FILE = 'AUTH_PHONE_HASH_SECRET_FILE'
    AUTH_OTP_PEPPER_SECRET_FILE = 'AUTH_OTP_PEPPER_FILE'
  }
  foreach ($sourceName in $secretMappings.Keys) {
    $targetName = $secretMappings[$sourceName]
    $sourceValue = [Environment]::GetEnvironmentVariable($sourceName, 'Process')
    if ($sourceValue) {
      if (-not $previous.ContainsKey($targetName)) {
        $previous[$targetName] = [Environment]::GetEnvironmentVariable($targetName, 'Process')
        $loadedNames.Add($targetName)
      }
      [Environment]::SetEnvironmentVariable($targetName, $sourceValue, 'Process')
    }
  }
  foreach ($name in @('NODE_ENV', 'MYSQL_TLS_ENABLED', 'REDIS_TLS_ENABLED')) {
    if (-not $previous.ContainsKey($name)) {
      $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
      $loadedNames.Add($name)
    }
  }
  [Environment]::SetEnvironmentVariable('NODE_ENV', 'production', 'Process')
  [Environment]::SetEnvironmentVariable('MYSQL_TLS_ENABLED', 'true', 'Process')
  [Environment]::SetEnvironmentVariable('REDIS_TLS_ENABLED', 'true', 'Process')

  Write-Output "RELEASE_WINDOW_COMMIT=$head"
  Write-Output "RELEASE_WINDOW_UTC=$([DateTimeOffset]::UtcNow.ToString('o'))"
  Write-Output "RELEASE_WINDOW_MODE=READ_ONLY_REPLAY_AND_IMMUTABILITY"
  & (Join-Path $root 'scripts\check-ledger-replay.ps1')
  if ($LASTEXITCODE -ne 0) { Fail "ledger replay failed" }
  & (Join-Path $root 'scripts\check-ledger-immutability.ps1')
  if ($LASTEXITCODE -ne 0) { Fail "ledger immutability failed" }
  Write-Output 'check-release-window-data: passed'
} finally {
  foreach ($name in $loadedNames) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
  }
}
