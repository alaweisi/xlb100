# Phase 5B gate: no fulfillment in worker module
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$workerDir = Join-Path $Root "backend\src\worker"
$migration = Join-Path $Root "db\migrations\008_worker_pool_taskpool_readiness_foundation.sql"

$forbidden = @(
  "fulfillment",
  "from '../fulfillment",
  "from `"../fulfillment",
  "backend/src/fulfillment"
)

$hits = @()
if (Test-Path $workerDir) {
  foreach ($pattern in $forbidden) {
    $found = Select-String -Path (Join-Path $workerDir "*.ts") -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($found) {
      foreach ($f in $found) {
        if ($f.Path -notmatch "README") { $hits += $f }
      }
    }
  }
}

if (Test-Path $migration) {
  $sql = Get-Content $migration -Raw
  if ($sql -match "CREATE TABLE.*fulfillment") {
    Write-Host "check-no-fulfillment-in-worker-phase5b FAILED: fulfillment table in migration"
    exit 1
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-fulfillment-in-worker-phase5b FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-fulfillment-in-worker-phase5b: passed"
