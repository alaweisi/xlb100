# Phase 5A gate: no national/global dispatch stream
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\streams"),
  (Join-Path $Root "backend\src\dispatch")
)

$forbidden = @(
  "xlb:dispatch:all",
  "xlb:dispatch:global",
  "xlb:dispatch:national",
  "xlb:dispatch:__global__"
)

$hits = @()
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  foreach ($pattern in $forbidden) {
    $found = Select-String -Path (Join-Path $dir "*.ts") -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($found) { $hits += $found }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-national-dispatch-stream FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-national-dispatch-stream: passed"
