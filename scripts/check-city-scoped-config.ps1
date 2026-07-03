# Phase 3 guard: city-scoped config modules must use ScopedExecutor / city_code
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$required = @(
  "backend/src/cityConfig/cityConfigRepository.ts",
  "backend/src/cityConfig/cityConfigService.ts",
  "backend/src/catalog/catalogRepository.ts",
  "backend/src/catalog/catalogService.ts",
  "backend/src/pricing/pricingRepository.ts",
  "backend/src/pricing/pricingService.ts"
)

$missing = @()
foreach ($f in $required) {
  if (-not (Test-Path (Join-Path $Root $f))) {
    $missing += $f
  }
}

if ($missing.Count -gt 0) {
  Write-Host "check-city-scoped-config FAILED — missing:"
  $missing | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$mustContain = @(
  @{ File = "backend/src/cityConfig/cityConfigService.ts"; Pattern = "executeCityScoped" },
  @{ File = "backend/src/catalog/catalogService.ts"; Pattern = "executeCityScoped" },
  @{ File = "backend/src/pricing/pricingService.ts"; Pattern = "executeCityScoped" }
)

foreach ($check in $mustContain) {
  $content = Get-Content (Join-Path $Root $check.File) -Raw
  if ($content -notmatch $check.Pattern) {
    Write-Host "check-city-scoped-config FAILED: $($check.File) missing $($check.Pattern)"
    exit 1
  }
}

Write-Host "check-city-scoped-config: passed"
