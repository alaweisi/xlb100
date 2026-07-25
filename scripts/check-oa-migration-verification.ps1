$ErrorActionPreference = "Stop"

$root = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $root) { throw "OA migration gate must run inside the XLB repository" }
$container = if ($env:MYSQL_CONTAINER) { $env:MYSQL_CONTAINER } else { "xlb-mysql-local" }
$database = "xlb_oa_migration_gate"
if ($database -notmatch '^xlb_oa_[a-z_]+$') { throw "unsafe OA migration gate database name" }

function Invoke-RootSql([string]$sql, [string]$targetDatabase = "") {
  $args = @("exec", "-e", "MYSQL_PWD=xlb_root_password", $container, "mysql", "-uroot", "-N", "-B")
  if ($targetDatabase) { $args += $targetDatabase }
  $args += @("-e", $sql)
  $result = & docker @args
  if ($LASTEXITCODE -ne 0) { throw "MySQL command failed" }
  return (($result | Out-String).Trim())
}

function Apply-SqlFile([string]$path) {
  Get-Content -LiteralPath $path -Encoding utf8 -Raw |
    docker exec -i -e MYSQL_PWD=xlb_root_password $container mysql -uroot --default-character-set=utf8mb4 $database
  if ($LASTEXITCODE -ne 0) { throw "Failed to apply $path" }
}

function Assert-Equal([string]$label, [string]$expected, [string]$actual) {
  if ($actual -ne $expected) { throw "$label expected $expected, found $actual" }
  Write-Host "PASS $label = $actual"
}

Push-Location $root
try {
  Invoke-RootSql "DROP DATABASE IF EXISTS $database; CREATE DATABASE $database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" | Out-Null
  $baselineMigrations = Get-ChildItem (Join-Path $root "db/migrations") -Filter "*.sql" |
    Where-Object {
      $_.BaseName -match '^(\d{3})_' -and [int]$Matches[1] -le 62
    } |
    Sort-Object Name
  foreach ($migration in $baselineMigrations) {
    Apply-SqlFile $migration.FullName
  }
  Write-Host "PASS canonical pre-OA 000-062 baseline"

  foreach ($pass in 1..2) {
    Apply-SqlFile (Join-Path $root "db/migrations/063_oa_collaboration_foundation.sql")
    Apply-SqlFile (Join-Path $root "db/migrations/064_oa_notifications.sql")
    Apply-SqlFile (Join-Path $root "db/migrations/065_oa_branch_city_ownership.sql")
    Write-Host "PASS OA migration application $pass"
  }

  Assert-Equal "OA migration markers" "3" (Invoke-RootSql "SELECT COUNT(*) FROM schema_migrations WHERE version IN ('063_oa_collaboration_foundation','064_oa_notifications','065_oa_branch_city_ownership')" $database)
  Assert-Equal "OA required tables" "24" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'oa_%'" $database)
  Assert-Equal "OA real-city checks" "11" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='CHECK' AND (constraint_name LIKE 'chk_oa_%_city_real' OR constraint_name='chk_oa_branch_city_owner_real')" $database)
  Assert-Equal "OA branch city owner primary key" "1" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='oa_branch_city_ownership' AND index_name='PRIMARY' AND column_name='city_code'" $database)
  Assert-Equal "OA activity source key columns" "3" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='oa_activity_projection' AND index_name='uk_oa_activity_source'" $database)
  Assert-Equal "OA notification dedupe key" "1" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='oa_notifications' AND index_name='uk_oa_notification_dedupe' AND column_name='dedupe_key'" $database)
  Assert-Equal "OA membership foreign keys" "2" (Invoke-RootSql "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('fk_oa_membership_admin','fk_oa_membership_org')" $database)
  Write-Host "check-oa-migration-verification: passed"
} finally {
  try { Invoke-RootSql "DROP DATABASE IF EXISTS $database" | Out-Null } catch { Write-Warning $_ }
  Pop-Location
}
