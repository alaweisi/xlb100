# Staging migration helper for Dockerized MySQL
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ComposeFile = Join-Path $Root "deploy\compose\docker-compose.staging.yml"
$EnvFile = Join-Path $Root ".env.staging.example"

$mysqlPort = $env:MYSQL_PORT
$mysqlDatabase = $env:MYSQL_DATABASE
$mysqlUser = $env:MYSQL_USER
$mysqlPassword = $env:MYSQL_PASSWORD

if (-not $mysqlPort) { $mysqlPort = "3306" }
if (-not $mysqlDatabase) { $mysqlDatabase = "xlb_staging" }
if (-not $mysqlUser) { $mysqlUser = "xlb" }
if (-not $mysqlPassword) { $mysqlPassword = "change-me" }

Write-Host "Running staging migrations via docker compose mysql service..."

$mysqlContainer = (docker compose --env-file $EnvFile -f $ComposeFile ps -q mysql | Out-String).Trim()
if (-not $mysqlContainer) { throw "staging mysql container is not running" }

$migrationDir = Join-Path $Root "db\migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $version = $file.BaseName
  if ($version -eq "000_init") {
    $exists = "0"
  } else {
    $existsRaw = docker compose --env-file $EnvFile -f $ComposeFile exec -e "MYSQL_PWD=$mysqlPassword" -T mysql mysql "-u$mysqlUser" $mysqlDatabase -N -e "SELECT COUNT(*) FROM schema_migrations WHERE version='$version'" 2>$null
    if ($LASTEXITCODE -ne 0) {
      $exists = "0"
    } else {
      $exists = ($existsRaw | Out-String).Trim()
    }
  }
  if ($exists -eq "1") {
    Write-Host "SKIP $version (already applied)"
    continue
  }

  Write-Host "APPLY $version"
  $containerPath = "/tmp/xlb_migration_$($file.Name)"
  docker cp $file.FullName "${mysqlContainer}:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -e "MYSQL_PWD=$mysqlPassword" -T mysql mysql "-u$mysqlUser" --default-character-set=utf8mb4 $mysqlDatabase -e "source ${containerPath}" 2>$null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  docker compose --env-file $EnvFile -f $ComposeFile exec -T mysql rm -f ${containerPath} 2>$null | Out-Null
}

Write-Host "migrate-staging: passed"
