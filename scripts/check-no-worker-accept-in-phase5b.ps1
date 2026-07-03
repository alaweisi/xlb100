# Phase 5B gate: no worker accept or assignment
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\worker"),
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
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  if (Test-Path $dir -PathType Leaf) {
    $files = @(Get-Item $dir)
  } else {
    $files = Get-ChildItem -Path $dir -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
    $files += Get-ChildItem -Path $dir -Filter "*.sql" -ErrorAction SilentlyContinue
  }
  foreach ($file in $files) {
    foreach ($pattern in $forbidden) {
      $found = Select-String -Path $file.FullName -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
      if ($found) { $hits += $found }
    }
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
