# Phase 11 gate: planner queries must use city_code = ? pattern (city-scoped).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$plannerDir = Join-Path $Root "backend\src\planner"
$planRepo = Join-Path $plannerDir "settlementExecutionDryRunPlannerRepository.ts"

# If planner directory doesn't exist yet, gate passes (pre-creation check)
if (-not (Test-Path $planRepo)) {
  if (Test-Path $plannerDir) {
    # Planner dir exists but no repository file yet — check all ts files
    $tsFiles = Get-ChildItem -Path $plannerDir -Filter "*.ts" -File -Recurse -ErrorAction SilentlyContinue
    $hasDbQueries = $false
    foreach ($file in $tsFiles) {
      $content = Get-Content $file.FullName -Raw
      if ($content -match '\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b') {
        $hasDbQueries = $true
        if ($content -notmatch 'city_code\s*=\s*\?') {
          Write-Host "check-phase11-city-scope: FAILED - SQL query in $($file.Name) missing city_code = ? pattern"
          exit 1
        }
      }
    }
    if (-not $hasDbQueries) {
      Write-Host "check-phase11-city-scope: passed (no SQL queries found yet)"
      exit 0
    }
  } else {
    Write-Host "check-phase11-city-scope: passed (planner directory not created yet)"
    exit 0
  }
}

$content = Get-Content $planRepo -Raw

# Must use city_code = ? in WHERE clauses
if ($content -match '\b(SELECT\b|FROM\b)' -and $content -notmatch 'city_code\s*=\s*\?') {
  Write-Host "check-phase11-city-scope: FAILED - repository missing city_code = ? in queries"
  exit 1
}

# Must use assertCityScopedContext or similar city scope guard
if ($content -notmatch 'assertCityScopedContext|city_code\s*=\s*\?') {
  Write-Host "check-phase11-city-scope: FAILED - no city scope guard or city_code = ? pattern found"
  exit 1
}

Write-Host "check-phase11-city-scope: passed"
