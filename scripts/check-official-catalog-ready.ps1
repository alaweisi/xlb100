# Phase 4 gate: official service catalog must be imported before order work
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$sourcePath = Join-Path $Root "docs\catalog\OFFICIAL_SERVICE_CATALOG_SOURCE.md"
$catalogSeed = Join-Path $Root "db\seed\007_official_catalog.seed.sql"
$pricingSeed = Join-Path $Root "db\seed\008_official_pricing.seed.sql"
$disableSeed = Join-Path $Root "db\seed\006_disable_demo_catalog.seed.sql"

$errors = @()

if (-not (Test-Path $sourcePath)) {
  $errors += "missing docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md"
} else {
  $source = Get-Content $sourcePath -Raw -Encoding UTF8
  if ($source -match "WAITING_FOR_USER_CONFIRMATION") {
    $errors += "OFFICIAL_SERVICE_CATALOG_SOURCE.md still waiting for user confirmation"
  }
  if ($source -notmatch "STATUS:\s*CONFIRMED") {
    $errors += "OFFICIAL_SERVICE_CATALOG_SOURCE.md not marked CONFIRMED"
  }
}

if (-not (Test-Path $disableSeed)) {
  $errors += "missing db/seed/006_disable_demo_catalog.seed.sql"
}
if (-not (Test-Path $catalogSeed)) {
  $errors += "missing db/seed/007_official_catalog.seed.sql"
}
if (-not (Test-Path $pricingSeed)) {
  $errors += "missing db/seed/008_official_pricing.seed.sql"
}

function Test-SeedFile($path, $label) {
  if (-not (Test-Path $path)) { return }
  $content = Get-Content $path -Raw -Encoding UTF8
  if ($content -match "'__global__'") {
    $script:errors += "$label contains __global__ as business cityCode"
  }
  $ids = Select-String -InputObject $content -Pattern "\('([a-z0-9_-]+)',\s*'(hangzhou|shanghai|beijing)'" -AllMatches |
    ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
  if ($ids.Count -gt 0) {
    $nonDemo = $ids | Where-Object { $_ -notlike "demo_*" }
    if ($nonDemo.Count -eq 0) {
      $script:errors += "$label contains only demo_cleaning entries"
    }
  }
}

Test-SeedFile $catalogSeed "007_official_catalog.seed.sql"
Test-SeedFile $pricingSeed "008_official_pricing.seed.sql"

if (Test-Path $catalogSeed) {
  $catalogContent = Get-Content $catalogSeed -Raw -Encoding UTF8
  $catIds = [regex]::Matches($catalogContent, "\('cat_\d{2}',\s*'hangzhou'") | ForEach-Object { $_.Value }
  if ($catIds.Count -lt 16) {
    $errors += "007_official_catalog.seed.sql must contain 16 level-1 categories for hangzhou (found $($catIds.Count))"
  }
}

if (Test-Path $pricingSeed) {
  $pricingContent = Get-Content $pricingSeed -Raw -Encoding UTF8
  if ($pricingContent -notmatch "price_hangzhou_sku_home_daily_2h") {
    $errors += "008_official_pricing.seed.sql missing official sku price (sku_home_daily_2h)"
  }
}

if ($errors.Count -gt 0) {
  Write-Host "check-official-catalog-ready FAILED:"
  Write-Host "Official catalog not imported — Phase 4 blocked"
  $errors | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "check-official-catalog-ready: passed"
