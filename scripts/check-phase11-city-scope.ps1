# Phase 11 gate: planner uses city scope
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$plannerDir = Join-Path $Root "backend\src\planner"
$violations = @()
if (Test-Path $plannerDir) {
  $tsFiles = Get-ChildItem -Path $plannerDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $tsFiles) {
    $content = Get-Content -Path $file.FullName -Raw
    if ($content -notmatch 'city[_-]code|cityCode|ctx\.cityCode|assertCityScopedContext|buildCityScopedWhere|getRequestContext') {
      $violations += "$($file.Name): missing city scope"
    }
  }
}
if ($violations.Count -gt 0) { Write-Host "FAILED"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase11-city-scope: passed"
