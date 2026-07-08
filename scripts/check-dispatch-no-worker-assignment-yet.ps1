# Phase 5A gate: no worker assignment yet
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$migration = Join-Path $Root "db\migrations\007_dispatch_outbox_city_stream_foundation.sql"
if (-not (Test-Path $migration)) {
  Write-Host "check-dispatch-no-worker-assignment-yet FAILED: migration 007 missing"
  exit 1
}

$migrationContent = Get-Content $migration -Raw
$forbiddenColumns = @("worker_id", "assigned_worker_id", "workerId", "assignedWorkerId")
foreach ($col in $forbiddenColumns) {
  if ($migrationContent -match $col) {
    Write-Host "check-dispatch-no-worker-assignment-yet FAILED: migration contains $col"
    exit 1
  }
}

$dispatchDir = Join-Path $Root "backend\src\dispatch"
$matcher = Join-Path $dispatchDir "workerMatcher.ts"
if (-not (Test-Path $matcher)) {
  Write-Host "check-dispatch-no-worker-assignment-yet FAILED: workerMatcher.ts missing"
  exit 1
}

$matcherContent = Get-Content $matcher -Raw
if ($matcherContent -notmatch "phase5a_no_worker_assignment") {
  Write-Host "check-dispatch-no-worker-assignment-yet FAILED: Phase 5A placeholder marker missing"
  exit 1
}

Write-Host "check-dispatch-no-worker-assignment-yet: passed"
