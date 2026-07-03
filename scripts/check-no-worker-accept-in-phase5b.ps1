# Phase 5B historical gate: task pool read-only only (Phase 7A+ accept lives in separate files)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  (Join-Path $Root "backend\src\worker\taskPoolRoutes.ts"),
  (Join-Path $Root "backend\src\worker\taskPoolService.ts"),
  (Join-Path $Root "db\migrations\008_worker_pool_taskpool_readiness_foundation.sql")
)

$forbidden = @(
  "acceptTask",
  "accepted_worker_id",
  "assigned_worker_id",
  "assignedWorkerId",
  "acceptedWorkerId"
)

$hits = @()
foreach ($file in $files) {
  if (-not (Test-Path $file)) { continue }
  foreach ($pattern in $forbidden) {
    $found = Select-String -Path $file -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($found) { $hits += $found }
  }
}

$migration007 = Join-Path $Root "db\migrations\007_dispatch_outbox_city_stream_foundation.sql"
$m7 = Get-Content $migration007 -Raw
if ($m7 -match "worker_id|assigned_worker") {
  Write-Host "check-no-worker-accept-in-phase5b FAILED: dispatch_tasks migration has worker fields"
  exit 1
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-worker-accept-in-phase5b FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-worker-accept-in-phase5b: passed"
