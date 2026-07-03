# Phase 5B historical gate: task pool files only (Phase 7A+ fulfillment lives in backend/src/fulfillment)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  (Join-Path $Root "backend\src\worker\taskPoolRoutes.ts"),
  (Join-Path $Root "backend\src\worker\taskPoolService.ts"),
  (Join-Path $Root "db\migrations\008_worker_pool_taskpool_readiness_foundation.sql")
)

$forbidden = @(
  "fulfillment",
  'from "../fulfillment',
  "backend/src/fulfillment"
)

$hits = @()
foreach ($file in $files) {
  if (-not (Test-Path $file)) { continue }
  foreach ($pattern in $forbidden) {
    $found = Select-String -Path $file -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($found) { $hits += $found }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-fulfillment-in-worker-phase5b FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-fulfillment-in-worker-phase5b: passed"
