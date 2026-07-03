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
$forbiddenPatterns = @("assignWorker", "assignedWorkerId", "workerId")
$hits = @()
foreach ($pattern in $forbiddenPatterns) {
  $found = Select-String -Path (Join-Path $dispatchDir "*.ts") -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
  if ($found) {
    foreach ($f in $found) {
      if ($f.Line -notmatch "assignWorker:\s*false|no_worker_assignment|Phase 5A") {
        $hits += $f
      }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-dispatch-no-worker-assignment-yet FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$matcher = Join-Path $dispatchDir "workerMatcher.ts"
if (-not (Test-Path $matcher)) {
  Write-Host "check-dispatch-no-worker-assignment-yet FAILED: workerMatcher.ts missing"
  exit 1
}

Write-Host "check-dispatch-no-worker-assignment-yet: passed"
