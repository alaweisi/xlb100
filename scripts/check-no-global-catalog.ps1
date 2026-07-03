# Phase 3 guard: catalog must not use __global__ or nationwide fallback
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$patterns = @(
  "__global__.*service_categories",
  "__global__.*service_items",
  "__global__.*service_skus",
  "national.*catalog",
  "nationwide.*catalog"
)

$hits = @()
foreach ($pattern in $patterns) {
  $found = Select-String -Path (Join-Path $Root "backend\src\catalog\*.ts") -Pattern $pattern -SimpleMatch:$false -ErrorAction SilentlyContinue
  if ($found) { $hits += $found }
}

$seedPath = Join-Path $Root "db\seed\004_catalog_demo.seed.sql"
if (Test-Path $seedPath) {
  $seed = Get-Content $seedPath -Raw
  if ($seed -match "'__global__'") {
    $hits += "db/seed/004_catalog_demo.seed.sql contains __global__"
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-global-catalog FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-global-catalog: passed"
