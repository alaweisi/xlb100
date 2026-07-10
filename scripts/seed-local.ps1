# Run db/seed against local Docker MySQL (idempotent)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Running seeds via docker exec..."

$seedDir = Join-Path $Root "db\seed"
$files = Get-ChildItem -Path $seedDir -Filter "*.sql" | Sort-Object Name

foreach ($file in $files) {
  Write-Host "SEED $($file.Name)"
  $containerPath = "/tmp/xlb_seed_$($file.Name)"
  docker cp $file.FullName "xlb-mysql-local:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec xlb-mysql-local mysql -uxlb -pxlb_local_password --default-character-set=utf8mb4 xlb_local -e `"source ${containerPath}`" 2>nul"
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec xlb-mysql-local rm -f ${containerPath} 2>nul" | Out-Null
}

# Phase 16 backfill is intentionally idempotent. Replaying it after catalog and
# pricing seeds also covers a brand-new database where migration 033 ran before
# any seeded SKUs existed.
$phase16Migration = Join-Path $Root "db\migrations\033_phase16_sku_pricing_standards.sql"
if (Test-Path -LiteralPath $phase16Migration) {
  Write-Host "POST-SEED 033_phase16_sku_pricing_standards"
  $containerPath = "/tmp/xlb_post_seed_033_phase16_sku_pricing_standards.sql"
  docker cp $phase16Migration "xlb-mysql-local:${containerPath}" | Out-Null
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec xlb-mysql-local mysql -uxlb -pxlb_local_password --default-character-set=utf8mb4 xlb_local -e `"source ${containerPath}`" 2>nul"
  if ($LASTEXITCODE -ne 0) { exit 1 }
  cmd /c "docker exec xlb-mysql-local rm -f ${containerPath} 2>nul" | Out-Null
}

Write-Host "seed-local: passed"
