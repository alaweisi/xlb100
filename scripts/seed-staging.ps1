# Staging seed helper for Dockerized MySQL
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $Root "deploy\compose\docker-compose.staging.yml"
$EnvFile = Join-Path $Root ".env.staging.example"

$mysqlDatabase = $env:MYSQL_DATABASE
$mysqlUser = $env:MYSQL_USER
$mysqlPassword = $env:MYSQL_PASSWORD

if (-not $mysqlDatabase) { $mysqlDatabase = "xlb_staging" }
if (-not $mysqlUser) { $mysqlUser = "xlb" }
if (-not $mysqlPassword) { $mysqlPassword = "change-me" }

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
