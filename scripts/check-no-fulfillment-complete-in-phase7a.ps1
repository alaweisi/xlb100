# Phase 7A gate: no fulfillment complete/start endpoints
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\fulfillment"),
  (Join-Path $Root "backend\src\worker")
)

$forbidden = @(
  "/complete",
  "completeFulfillment",
  "startFulfillment",
  "/start",
  "POST.*complete"
)

$hits = @()
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  $files = Get-ChildItem -Path $dir -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    if ($file.Name -eq "README.md") { continue }
    $content = Get-Content $file.FullName -Raw
    if ($content -match "/complete|/start|completeFulfillment|startFulfillment") {
      $hits += $file.FullName
    }
  }
}

$fulfillmentRepo = Join-Path $Root "backend\src\fulfillment\fulfillmentRepository.ts"
$repoContent = Get-Content $fulfillmentRepo -Raw
if ($repoContent -match "completed_at\s*=" -and $repoContent -match "INSERT|UPDATE") {
  if ($repoContent -match "completed_at\s*=\s*CURRENT|SET completed_at") {
    $hits += "${fulfillmentRepo}: writes completed_at on insert/update"
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-fulfillment-complete-in-phase7a FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-fulfillment-complete-in-phase7a: passed"
