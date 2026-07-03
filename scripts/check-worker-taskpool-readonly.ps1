# Phase 5B gate: task pool must be read-only
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$taskPool = Join-Path $Root "backend\src\worker\taskPoolService.ts"
if (-not (Test-Path $taskPool)) {
  Write-Host "check-worker-taskpool-readonly FAILED: taskPoolService.ts missing"
  exit 1
}

$content = Get-Content $taskPool -Raw

$forbidden = @(
  "UPDATE dispatch_tasks",
  "INSERT INTO dispatch_tasks",
  "acceptTask",
  "INSERT INTO fulfillment",
  "UPDATE fulfillment"
)

foreach ($pattern in $forbidden) {
  if ($content -match $pattern) {
    Write-Host "check-worker-taskpool-readonly FAILED: found $pattern"
    exit 1
  }
}

if ($content -notmatch "listQueuedTasks") {
  Write-Host "check-worker-taskpool-readonly FAILED: must read queued tasks only"
  exit 1
}

Write-Host "check-worker-taskpool-readonly: passed"
