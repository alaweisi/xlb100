# Run db/migrations against local Docker MySQL (xlb_local)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Running migrations via docker exec..."

$migrationDir = Join-Path $Root "db\migrations"
$files = Get-ChildItem -Path $migrationDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  $version = $file.BaseName
  $existsRaw = cmd /c "docker exec xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local -N -e `"SELECT COUNT(*) FROM schema_migrations WHERE version='$version'`" 2>nul"
  $exists = ($existsRaw | Out-String).Trim()
  if ($exists -eq "1") {
    Write-Host "SKIP $version (already applied)"
    continue
  }
  Write-Host "APPLY $version"
  cmd /c type "$($file.FullName)" | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local 2>nul
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "migrate-local: passed"
