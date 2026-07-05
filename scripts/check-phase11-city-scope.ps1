# Phase 11 gate: planner queries use city_code\s*=|cityCode|ctx\.cityCode ? pattern
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$plannerDir = Join-Path $Root "backend\src\planner"
$violations = @()
if (Test-Path $plannerDir) {
  $tsFiles = Get-ChildItem -Path $plannerDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    # Must have at least one city_code\s*=|cityCode|ctx\.cityCode ? OR buildCityScopedWhere OR assertCityScopedContext
    if ($content -notmatch 'city_code\s*=|buildCityScopedWhere|assertCityScopedContext') {
      $violations += "$($file.Name): has SQL queries but missing city_code\s*=|cityCode|ctx\.cityCode ? pattern"
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase11-city-scope: FAILED - SQL query missing city_code\s*=|cityCode|ctx\.cityCode ? pattern"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase11-city-scope: passed"
