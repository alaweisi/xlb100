# Phase 4 gate: must not rely on demo catalog alone
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$officialCatalog = Join-Path $Root "db\seed\007_official_catalog.seed.sql"
$officialPricing = Join-Path $Root "db\seed\008_official_pricing.seed.sql"
$disableDemo = Join-Path $Root "db\seed\006_disable_demo_catalog.seed.sql"
$demoCatalog = Join-Path $Root "db\seed\004_catalog_demo.seed.sql"

$errors = @()

if (-not (Test-Path $officialCatalog)) {
  $errors += "007_official_catalog.seed.sql missing — still demo-only catalog"
}
if (-not (Test-Path $officialPricing)) {
  $errors += "008_official_pricing.seed.sql missing — still demo-only pricing"
}
if (-not (Test-Path $disableDemo)) {
  $errors += "006_disable_demo_catalog.seed.sql missing — demo not disabled"
}

if ($errors.Count -gt 0) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked:"
  $errors | ForEach-Object { Write-Host "  - $_" }
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
$skus = [regex]::Matches($pricing, "'([a-z0-9_-]+)',\s*'(hangzhou|shanghai|beijing)',\s*'(sku_[a-z0-9_]+)'") | ForEach-Object { $_.Groups[3].Value } | Select-Object -Unique
if ($skus.Count -eq 0) {
  $skus = [regex]::Matches($pricing, "sku_id[^']*'(sku_[a-z0-9_]+)'") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
}
$nonDemoSkus = $skus | Where-Object { $_ -notlike "demo_*" }

if ($nonDemoSkus.Count -eq 0) {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: official pricing still only demo_cleaning_sku"
  exit 1
}

$disableContent = Get-Content $disableDemo -Raw -Encoding UTF8
if ($disableContent -notmatch "demo_cleaning_category") {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: 006_disable_demo_catalog.seed.sql does not disable demo_cleaning_category"
  exit 1
}
if ($disableContent -notmatch "is_enabled\s*=\s*0") {
  Write-Host "check-no-demo-catalog-for-phase4 FAILED:"
  Write-Host "Phase 4 blocked: 006_disable_demo_catalog.seed.sql must set is_enabled = 0"
  exit 1
}

if (Test-Path $demoCatalog) {
  Write-Host "note: demo catalog seed still present (audit-retained) — disabled by 006_disable_demo_catalog.seed.sql"
}

Write-Host "check-no-demo-catalog-for-phase4: passed"
