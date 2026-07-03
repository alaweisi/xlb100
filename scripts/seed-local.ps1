# Run db/seed against local Docker MySQL (idempotent)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Running seeds via docker exec..."

$seedDir = Join-Path $Root "db\seed"
$files = Get-ChildItem -Path $seedDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  Write-Host "SEED $($file.Name)"
  $sql = Get-Content -Path $file.FullName -Raw -Encoding UTF8
  $sql | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "seed-local: passed"
