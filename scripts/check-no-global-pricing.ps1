# Phase 3 guard: pricing must not use __global__ or nationwide fallback
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$patterns = @(
  "__global__.*price_rules",
  "national.*pricing",
  "nationwide.*pricing"
)

$hits = @()
foreach ($pattern in $patterns) {
  $found = Select-String -Path (Join-Path $Root "backend\src\pricing\*.ts") -Pattern $pattern -SimpleMatch:$false -ErrorAction SilentlyContinue
  if ($found) { $hits += $found }
}

$seedPath = Join-Path $Root "db\seed\005_pricing_demo.seed.sql"
if (Test-Path $seedPath) {
  $seed = Get-Content $seedPath -Raw
  if ($seed -match "'__global__'") {
    $hits += "db/seed/005_pricing_demo.seed.sql contains __global__"
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-global-pricing FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-global-pricing: passed"
