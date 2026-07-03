# Phase 6 historical gate: certification module only (Phase 7A accept in workerAccept*)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\compliance"),
  (Join-Path $Root "db\migrations\009_certification_worker_eligibility_foundation.sql")
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
    if ($file.Name -eq "README.md") { continue }
    foreach ($pattern in $forbidden) {
      $found = Select-String -Path $file.FullName -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
      if ($found) { $hits += $found }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-certification-no-accept FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-certification-no-accept: passed"
