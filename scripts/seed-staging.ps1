# Staging seed helper for Dockerized MySQL
[CmdletBinding()]
param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $Root "deploy\compose\docker-compose.staging.yml"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $Root ".env.staging.local"
}
$EnvFile = [IO.Path]::GetFullPath($EnvFile)
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
  throw "staging env file not found: $EnvFile. Create it from the checked-in template and provide strong secrets."
}

function Get-StagingEnvValue([string]$Name, [string]$Fallback = "") {
  $processValue = [Environment]::GetEnvironmentVariable($Name)
  if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
  $prefix = "$Name="
  $line = Get-Content -Encoding UTF8 -LiteralPath $EnvFile |
    Where-Object { $_.TrimStart().StartsWith($prefix, [StringComparison]::Ordinal) } |
    Select-Object -Last 1
  if ($null -eq $line) { return $Fallback }
  $value = $line.TrimStart().Substring($prefix.Length).Trim()
  if ($value.Length -ge 2 -and (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    )) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

$mysqlDatabase = Get-StagingEnvValue "MYSQL_DATABASE" "xlb_staging"
$mysqlUser = Get-StagingEnvValue "MYSQL_USER" "xlb"
$mysqlPassword = Get-StagingEnvValue "MYSQL_PASSWORD"
if ($mysqlPassword.Length -lt 16 -or $mysqlPassword -match '(?i)^(change-me|changeme|password|secret)$') {
  throw "MYSQL_PASSWORD must be an explicit, non-default staging secret of at least 16 characters"
}

Write-Host "Running staging seeds via docker compose mysql service..."

$mysqlContainer = (docker compose --env-file $EnvFile -f $ComposeFile ps -q mysql | Out-String).Trim()
if (-not $mysqlContainer) { throw "staging mysql container is not running" }

$seedDir = Join-Path $Root "db\seed"
$files = Get-ChildItem -Path $seedDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  Write-Host "SEED $($file.Name)"
  $containerPath = "/tmp/xlb_seed_$($file.Name)"
  docker cp $file.FullName "${mysqlContainer}:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -e "MYSQL_PWD=$mysqlPassword" -T mysql mysql "-u$mysqlUser" --default-character-set=utf8mb4 $mysqlDatabase -e "source ${containerPath}" 2>$null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -T mysql rm -f ${containerPath} 2>$null | Out-Null
}

# Migration 033 also contains the idempotent Phase 16 data backfill. Re-run it
# after catalog and pricing seeds so a clean staging database receives the same
# SKU profiles, standards, and fee items as an upgraded database.
$phase16Migration = Join-Path $Root "db\migrations\033_phase16_sku_pricing_standards.sql"
if (Test-Path -LiteralPath $phase16Migration) {
  Write-Host "POST-SEED 033_phase16_sku_pricing_standards"
  $containerPath = "/tmp/xlb_post_seed_033_phase16_sku_pricing_standards.sql"
  docker cp $phase16Migration "${mysqlContainer}:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -e "MYSQL_PWD=$mysqlPassword" -T mysql mysql "-u$mysqlUser" --default-character-set=utf8mb4 $mysqlDatabase -e "source ${containerPath}" 2>$null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -T mysql rm -f ${containerPath} 2>$null | Out-Null
}

Write-Host "seed-staging: passed"
