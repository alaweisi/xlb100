# Phase 12 gate: preparation uses city scope
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$preparationDir = Join-Path $Root "backend\src\preparation"
$violations = @()
if (-not (Test-Path $preparationDir)) {
  Write-Host "check-phase12-city-scope: passed (preparation directory not yet created)"
  exit 0
}
$tsFiles = Get-ChildItem -Path $preparationDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
foreach ($file in $tsFiles) {
  $content = Get-Content -Path $file.FullName -Raw
  if ($content -notmatch 'city[_-]code|cityCode|ctx\.cityCode|assertCityScopedContext|buildCityScopedWhere|getRequestContext') {
    $violations += "$($file.Name): missing city scope"
  }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-city-scope: FAILED"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-city-scope: passed"
