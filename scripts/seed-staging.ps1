# Staging seed helper for Dockerized MySQL
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$mysqlHost = $env:MYSQL_HOST
$mysqlDatabase = $env:MYSQL_DATABASE
$mysqlUser = $env:MYSQL_USER
$mysqlPassword = $env:MYSQL_PASSWORD

if (-not $mysqlHost) { throw "MYSQL_HOST is required (for staging container name, e.g. mysql)" }
if (-not $mysqlDatabase) { $mysqlDatabase = "xlb_staging" }
if (-not $mysqlUser) { $mysqlUser = "xlb" }
if (-not $mysqlPassword) { throw "MYSQL_PASSWORD is required" }

Write-Host "Running staging seeds via docker exec on '$mysqlHost'..."

$seedDir = Join-Path $Root "db\seed"
$files = Get-ChildItem -Path $seedDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  Write-Host "SEED $($file.Name)"
  $containerPath = "/tmp/xlb_seed_$($file.Name)"
  docker cp $file.FullName "$mysqlHost:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec $mysqlHost mysql -u$mysqlUser -p$mysqlPassword --default-character-set=utf8mb4 $mysqlDatabase -e \"source ${containerPath}\" 2>nul"
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec $mysqlHost rm -f ${containerPath} 2>nul" | Out-Null
}

Write-Host "seed-staging: passed"
