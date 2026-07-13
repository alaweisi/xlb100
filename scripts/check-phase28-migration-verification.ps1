param(
  [string]$MysqlContainer = "xlb-mysql-local"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Scalar([string]$Sql) {
  $value = & docker exec -i $MysqlContainer mysql -uxlb -pxlb_local_password xlb_local -N -e $Sql
  if ($LASTEXITCODE -ne 0) { throw "MySQL verification query failed" }
  return ($value | Out-String).Trim()
}

function Assert-Equal([string]$Label, [string]$Expected, [string]$Actual) {
  if ($Expected -ne $Actual) { throw "$Label expected $Expected, got $Actual" }
  Write-Host "PASS $Label = $Actual"
}

$health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $MysqlContainer 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $health -ne 'healthy') {
  throw "$MysqlContainer must be running and healthy; current status: $health"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
if ($LASTEXITCODE -ne 0) { throw "local migration failed" }
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
if ($LASTEXITCODE -ne 0) { throw "double-run migration replay failed" }

Assert-Equal 'migration 056 applied once' '1' (Invoke-Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='056_phase28_review_reputation'")
Assert-Equal 'source event major column' '1' (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='event_major_version' AND is_nullable='NO'")
Assert-Equal 'legacy source major default zero' '1' (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name='event_major_version' AND column_default='0'")

$cityReviewFks = Invoke-Scalar @"
SELECT COUNT(*) FROM (
  SELECT constraint_name
  FROM information_schema.key_column_usage
  WHERE constraint_schema=DATABASE() AND table_name='order_reviews'
    AND referenced_table_name IS NOT NULL
  GROUP BY constraint_name
  HAVING SUM(column_name='city_code') > 0
) scoped_review_fks
"@
if ([int]$cityReviewFks -lt 3) { throw "order_reviews requires at least three composite city foreign keys; found $cityReviewFks" }
Write-Host "PASS order_reviews composite city foreign keys = $cityReviewFks"

Assert-Equal 'Phase28 global business rows' '0' (Invoke-Scalar @"
SELECT COALESCE(SUM(global_rows),0) FROM (
  SELECT COUNT(*) global_rows FROM review_moderation_decisions WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM review_visibility_states WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM review_appeals WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM reputation_projection_generations WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM reputation_projection_pointers WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM reputation_review_contributions WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM reputation_worker_aggregates WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM review_content_access_audits WHERE city_code='__global__'
  UNION ALL SELECT COUNT(*) FROM reputation_projection_receipts WHERE city_code='__global__'
) phase28_global
"@)

& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase28-review-reputation-boundaries.ps1
if ($LASTEXITCODE -ne 0) { throw "Phase28 boundary gate failed" }

Write-Output "check-phase28-migration-verification: passed"
