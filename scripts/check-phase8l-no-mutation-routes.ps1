# Phase 8L gate: reconciliation gap scan routes must be read-only (app.get only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8l-no-mutation-routes: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Check for app.post/put/patch/delete within Phase 8L reconciliation gap scan path routes
$mutationPatterns = @(
  'app\.post\s*\([^)]*reconciliation.?gap.?scan',
  'app\.put\s*\([^)]*reconciliation.?gap.?scan',
  'app\.patch\s*\([^)]*reconciliation.?gap.?scan',
  'app\.delete\s*\([^)]*reconciliation.?gap.?scan',
  'app\.post\s*\([^)]*ReconciliationGapScan',
  'app\.put\s*\([^)]*ReconciliationGapScan',
  'app\.patch\s*\([^)]*ReconciliationGapScan',
  'app\.delete\s*\([^)]*ReconciliationGapScan'
)

$violations = @()
foreach ($pattern in $mutationPatterns) {
  if ($content -match $pattern) {
    $violations += "found mutation route matching: $pattern"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase8l-no-mutation-routes: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Verify the Phase 8L section only uses app.get for reconciliation gap scan routes
$lines = Get-Content $routesFile
$inPhase8L = $false
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  if ($line -match 'Phase 8L') { $inPhase8L = $true; continue }
  if ($inPhase8L -and $line -match '^\s*app\.(post|put|patch|delete)\s*\(') {
    # Only flag if the route path contains "reconciliation-gap-scan"
    $nextLine = $lines[$lineNum]  # 0-based index, lineNum is 1-based
    if (-not $nextLine) { $nextLine = "" }
    $combined = $line + " " + $nextLine
    if ($combined -match 'reconciliation.?gap.?scan') {
      Write-Host "check-phase8l-no-mutation-routes: FAILED - mutation route in Phase 8L section at line $lineNum"
      Write-Host "  $line"
      exit 1
    }
  }
}

Write-Host "check-phase8l-no-mutation-routes: passed"
