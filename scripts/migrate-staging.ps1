# Staging migration helper for Dockerized MySQL
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$mysqlHost = $env:MYSQL_HOST
$mysqlPort = $env:MYSQL_PORT
$mysqlDatabase = $env:MYSQL_DATABASE
$mysqlUser = $env:MYSQL_USER
$mysqlPassword = $env:MYSQL_PASSWORD

if (-not $mysqlHost) { throw "MYSQL_HOST is required (for staging container name, e.g. mysql)" }
if (-not $mysqlPort) { $mysqlPort = "3306" }
if (-not $mysqlDatabase) { $mysqlDatabase = "xlb_staging" }
if (-not $mysqlUser) { $mysqlUser = "xlb" }
if (-not $mysqlPassword) { throw "MYSQL_PASSWORD is required" }

Write-Host "Running staging migrations via docker exec on '$mysqlHost'..."

$migrationDir = Join-Path $Root "db\migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $version = $file.BaseName
  $existsRaw = cmd /c "docker exec $mysqlHost mysql -u$mysqlUser -p$mysqlPassword $mysqlDatabase -N -e \"SELECT COUNT(*) FROM schema_migrations WHERE version='$version'\" 2>nul"
  $exists = ($existsRaw | Out-String).Trim()
  if ($exists -eq "1") {
    Write-Host "SKIP $version (already applied)"
    continue
  }

  Write-Host "APPLY $version"
  $containerPath = "/tmp/xlb_migration_$($file.Name)"
  docker cp $file.FullName "$mysqlHost:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec $mysqlHost mysql -u$mysqlUser -p$mysqlPassword --default-character-set=utf8mb4 $mysqlDatabase -e \"source ${containerPath}\" 2>nul"
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec $mysqlHost rm -f ${containerPath} 2>nul" | Out-Null
}

Write-Host "migrate-staging: passed"
