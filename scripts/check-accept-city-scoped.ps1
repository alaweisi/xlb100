# Phase 7A gate: accept and acceptance/fulfillment must be city-scoped
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  (Join-Path $Root "backend\src\worker\workerAcceptService.ts"),
  (Join-Path $Root "backend\src\worker\workerAcceptRepository.ts"),
  (Join-Path $Root "backend\src\fulfillment\fulfillmentRepository.ts"),
  (Join-Path $Root "backend\src\dispatch\dispatchRepository.ts")
)

foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    Write-Host "check-accept-city-scoped FAILED: missing $file"
    exit 1
  }
  $content = Get-Content $file -Raw
  if ($content -notmatch "city_code|buildCityScopedWhere|cityCode") {
    Write-Host "check-accept-city-scoped FAILED: no city scope in $file"
    exit 1
  }
}

$migration = Join-Path $Root "db\migrations\010_worker_accept_fulfillment_skeleton_foundation.sql"
$m = Get-Content $migration -Raw
if ($m -notmatch "city_code") {
  Write-Host "check-accept-city-scoped FAILED: migration missing city_code"
  exit 1
}
if ($m -match "__global__") {
  Write-Host "check-accept-city-scoped FAILED: __global__ in migration"
  exit 1
}

Write-Host "check-accept-city-scoped: passed"
