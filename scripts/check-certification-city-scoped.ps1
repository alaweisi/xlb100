# Phase 6 gate: certification / qualification queries must be city-scoped
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  (Join-Path $Root "backend\src\compliance\workerCertification\workerCertificationRepository.ts"),
  (Join-Path $Root "backend\src\compliance\qualification\qualificationRepository.ts"),
  (Join-Path $Root "backend\src\compliance\certMatcher\workerDispatchEligibility.ts")
)

foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    Write-Host "check-certification-city-scoped FAILED: missing $file"
    exit 1
  }
  $content = Get-Content $file -Raw
  if ($content -notmatch "city_code|buildCityScopedWhere|cityCode") {
    Write-Host "check-certification-city-scoped FAILED: no city scope in $file"
    exit 1
  }
}

$migration = Join-Path $Root "db\migrations\009_certification_worker_eligibility_foundation.sql"
$m = Get-Content $migration -Raw
if ($m -notmatch "city_code") {
  Write-Host "check-certification-city-scoped FAILED: migration missing city_code"
  exit 1
}
if ($m -match "__global__") {
  Write-Host "check-certification-city-scoped FAILED: __global__ in migration"
  exit 1
}

Write-Host "check-certification-city-scoped: passed"
