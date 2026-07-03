# Phase 5B gate: task pool must filter by city_code
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  (Join-Path $Root "backend\src\worker\taskPoolService.ts"),
  (Join-Path $Root "backend\src\dispatch\dispatchRepository.ts")
)

foreach ($file in $files) {
  if (-not (Test-Path $file)) {
    Write-Host "check-worker-taskpool-city-scoped FAILED: missing $file"
    exit 1
  }
  $content = Get-Content $file -Raw
  if ($content -notmatch "city_code|cityCode|buildCityScopedWhere") {
    Write-Host "check-worker-taskpool-city-scoped FAILED: $file lacks city scoping"
    exit 1
  }
}

$repo = Get-Content (Join-Path $Root "backend\src\dispatch\dispatchRepository.ts") -Raw
if ($repo -notmatch "listQueuedTasks") {
  Write-Host "check-worker-taskpool-city-scoped FAILED: listQueuedTasks missing"
  exit 1
}

Write-Host "check-worker-taskpool-city-scoped: passed"
