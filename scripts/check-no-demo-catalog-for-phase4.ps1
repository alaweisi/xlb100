# Phase 4 gate: must not rely on demo catalog alone
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$officialCatalog = Join-Path $Root "db\seed\007_official_catalog.seed.sql"
$officialPricing = Join-Path $Root "db\seed\008_official_pricing.seed.sql"
$demoCatalog = Join-Path $Root "db\seed\004_catalog_demo.seed.sql"

if (-not (Test-Path $officialCatalog)) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: 007_official_catalog.seed.sql missing — still demo-only catalog"
  exit 1
}

if (-not (Test-Path $officialPricing)) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: 008_official_pricing.seed.sql missing — still demo-only pricing"
  exit 1
}

$content = Get-Content $officialCatalog -Raw -Encoding UTF8
$cats = [regex]::Matches($content, "\('([a-z0-9_-]+)',\s*'(hangzhou|shanghai|beijing)'") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
$nonDemoCats = $cats | Where-Object { $_ -notlike "demo_*" }

if ($nonDemoCats.Count -eq 0) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: official catalog still only demo_cleaning_category"
  exit 1
}

$pricing = Get-Content $officialPricing -Raw -Encoding UTF8
$skus = [regex]::Matches($pricing, "'([a-z0-9_-]+)',\s*'(hangzhou|shanghai|beijing)',\s*'([a-z0-9_-]+)'") | ForEach-Object { $_.Groups[3].Value } | Select-Object -Unique
if ($skus.Count -eq 0) {
  $skus = [regex]::Matches($pricing, "sku_id[^']*'([a-z0-9_-]+)'") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
}
$nonDemoSkus = $skus | Where-Object { $_ -notlike "demo_*" }

if ($nonDemoSkus.Count -eq 0) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: official pricing still only demo_cleaning_sku"
  exit 1
}

if (Test-Path $demoCatalog) {
  Write-Host "note: demo catalog seed still present — run 006_disable_demo_catalog.seed.sql after official import"
}

Write-Host "check-no-demo-catalog-for-phase4: passed"
