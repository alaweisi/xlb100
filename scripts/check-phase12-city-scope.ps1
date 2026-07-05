# Phase 12 gate: preparation SQL uses city scope.
# All preparation/ SQL must use city_code = ? or buildCityScopedWhere
# or assertCityScopedContext.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$preparationDir = Join-Path $Root "backend\src\preparation"
$violations = @()

if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-city-scope: passed (preparation directory not yet created)"
  exit 0
}

$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue

foreach ($file in $tsFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  # Check for at least one city-scoping mechanism
  if ($content -match 'city_code\s*=\s*\?' -or
      $content -match 'cityCode' -or
      $content -match 'assertCityScopedContext' -or
      $content -match 'buildCityScopedWhere' -or
      $content -match 'getRequestContext') {
    # Has city scope - ok
    continue
  }
  # Files with no SQL queries at all are also fine (route files, type defs, etc.)
  if ($content -notmatch '\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b') {
    continue
  }
  # Has SQL but no city scope - violation
  $violations += "$($file.Name): missing city scope (has SQL queries but no city_code = ? / buildCityScopedWhere / assertCityScopedContext)"
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase12-city-scope: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase12-city-scope: passed"
