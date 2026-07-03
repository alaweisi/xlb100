# Run db/migrations against local Docker MySQL (xlb_local)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Running migrations via docker exec..."

$migrationDir = Join-Path $Root "db\migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $version = $file.BaseName
  $existsRaw = docker exec xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local -N -e "SELECT COUNT(*) FROM schema_migrations WHERE version='$version'" 2>$null
  $exists = ($existsRaw | Out-String).Trim()
  if ($exists -eq "1") {
    Write-Host "SKIP $version (already applied)"
    continue
  }
  Write-Host "APPLY $version"
  $sql = Get-Content -Path $file.FullName -Raw -Encoding UTF8
  $sql | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "migrate-local: passed"
