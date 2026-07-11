$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BaseRef = "xlb-phase22-e2e-security-performance-gates"

function Require-Match([string]$Label, [string]$Content, [string]$Pattern) {
  if ($Content -notmatch $Pattern) { throw "$Label is missing required evidence: $Pattern" }
  Write-Host "PASS $Label"
}

Push-Location $Root
try {
  & git rev-parse --verify "$BaseRef^{commit}" *> $null
  if ($LASTEXITCODE -ne 0) { throw "missing locked Phase 22 baseline tag: $BaseRef" }

  $lockedMigrationDiff = @(& git diff --name-only $BaseRef -- db/migrations | Where-Object {
    $_ -match '^db/migrations/(?:0(?:0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-2]))_'
  })
  if ($LASTEXITCODE -ne 0) { throw "unable to compare locked migrations with $BaseRef" }
  if ($lockedMigrationDiff.Count -gt 0) {
    throw "locked migrations were modified: $($lockedMigrationDiff -join ', ')"
  }
  Write-Host "PASS locked migrations 000-042 are unchanged"

  $migrationFiles = @(Get-ChildItem (Join-Path $Root "db/migrations") -File -Filter "*.sql" | Sort-Object Name)
  $phase23Migrations = @($migrationFiles | Where-Object { $_.Name -match '^04[3-9]_' -or $_.Name -match '^(?:0[5-9][0-9]|[1-9][0-9]{2,})_' })
  if ($phase23Migrations.Count -ne 1 -or $phase23Migrations[0].Name -notmatch '^043_') {
    throw "Phase 23A must introduce exactly one append-only 043 migration; found: $($phase23Migrations.Name -join ', ')"
  }
  $migration = Get-Content $phase23Migrations[0].FullName -Raw
  Require-Match "043 worker phone hash table target" $migration '(?is)ALTER\s+TABLE\s+worker_profiles'
  Require-Match "043 worker phone hash column" $migration '(?is)phone_hash'
  Require-Match "043 worker phone hash uniqueness" $migration '(?is)(UNIQUE|CREATE\s+UNIQUE\s+INDEX)'

  $forbiddenDomainDiff = @(& git diff --name-only $BaseRef -- backend/src/order backend/src/payment backend/src/dispatch backend/src/ledger backend/src/settlement backend/src/aftersale backend/src/fulfillment)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect protected business domains" }
  $forbiddenDomainDiff += @(& git ls-files --others --exclude-standard -- backend/src/order backend/src/payment backend/src/dispatch backend/src/ledger backend/src/settlement backend/src/aftersale backend/src/fulfillment)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect untracked protected business files" }
  if ($forbiddenDomainDiff.Count -gt 0) {
    throw "Phase 23A expanded protected business semantics: $($forbiddenDomainDiff -join ', ')"
  }
  Write-Host "PASS order/payment/dispatch/ledger/settlement/refund semantics are unchanged"

  $providerDiff = @(& git diff --name-only $BaseRef -- backend/src/providers backend/src/dispatch/geoProvider.ts)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect provider boundaries" }
  $providerDiff += @(& git ls-files --others --exclude-standard -- backend/src/providers backend/src/dispatch/geoProvider.ts)
  if ($LASTEXITCODE -ne 0) { throw "unable to inspect untracked provider files" }
  if ($providerDiff.Count -gt 0) {
    throw "Phase 23A modified provider/infrastructure integration files: $($providerDiff -join ', ')"
  }
  Write-Host "PASS no payment, Amap, or OSS provider integration changes"

  $authRoutes = Get-Content (Join-Path $Root "backend/src/auth/authRoutes.ts") -Raw
  Require-Match "production OTP debug registration guard" $authRoutes '(?is)registerDebugRoutes\s*=\s*[^;]*(production|nodeEnv|NODE_ENV)'
  Require-Match "conditional OTP debug route registration" $authRoutes '(?is)if\s*\(\s*registerDebugRoutes\s*\)\s*\{\s*app\.get\s*\(\s*["'']/api/auth/(customer|admin|worker)/debug-code'

  $authService = Get-Content (Join-Path $Root "backend/src/auth/authService.ts") -Raw
  if ($authService -match '(?is)WHERE\s+phone_hash\s+IS\s+NULL\s+AND\s+phone_masked\s*=') {
    throw "worker login must fail closed for legacy rows; masked-phone fallback can bind an attacker-controlled full phone to an account"
  }
  Require-Match "worker exact phone hash lookup" $authService '(?is)FROM\s+worker_profiles\s+WHERE\s+phone_hash\s*=\s*\?'

  $rateLimit = Get-Content (Join-Path $Root "backend/src/security/rateLimit.ts") -Raw
  foreach ($route in @("/api/auth/customer/code", "/api/auth/admin/code", "/api/auth/worker/code")) {
    Require-Match "OTP rate limit route $route" $rateLimit ([regex]::Escape($route))
  }

  $citySchema = Get-Content (Join-Path $Root "packages/validators/src/cityConfigSchema.ts") -Raw
  $cityRepository = Get-Content (Join-Path $Root "backend/src/cityConfig/cityConfigRepository.ts") -Raw
  Require-Match "CityConfig expectedVersion contract" $citySchema '(?is)expectedVersion\s*:'
  Require-Match "CityConfig version compare-and-swap" $cityRepository '(?is)WHERE.{0,300}version\s*=\s*\?'
  Require-Match "CityConfig conflict detection" $cityRepository '(?is)(affectedRows|CityConfigVersionConflict|Optimistic|Conflict)'
} finally {
  Pop-Location
}

Write-Host "check-phase23a-boundaries: passed"
