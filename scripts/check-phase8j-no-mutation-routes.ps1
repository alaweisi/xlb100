# Phase 8J gate: review summary routes must be read-only (app.get only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8j-no-mutation-routes: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Check for app.post/put/patch/delete within Phase 8J review summary path routes
$mutationPatterns = @(
  'app\.post\s*\([^)]*statement.*review.?summary',
  'app\.put\s*\([^)]*statement.*review.?summary',
  'app\.patch\s*\([^)]*statement.*review.?summary',
  'app\.delete\s*\([^)]*statement.*review.?summary',
  'app\.post\s*\([^)]*review.?summary',
  'app\.put\s*\([^)]*review.?summary',
  'app\.patch\s*\([^)]*review.?summary',
  'app\.delete\s*\([^)]*review.?summary'
)

$violations = @()
foreach ($pattern in $mutationPatterns) {
  if ($content -match $pattern) {
    $violations += "found mutation route matching: $pattern"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase8j-no-mutation-routes: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Verify the Phase 8J section only uses app.get for review summary routes
$lines = Get-Content $routesFile
$inPhase8J = $false
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  if ($line -match 'Phase 8J') { $inPhase8J = $true; continue }
  if ($inPhase8J -and $line -match '^\s*app\.(post|put|patch|delete)\s*\(') {
    # Only flag if the route path contains "review-summary"
    $nextLine = $lines[$lineNum]  # 0-based index, lineNum is 1-based
    if (-not $nextLine) { $nextLine = "" }
    $combined = $line + " " + $nextLine
    if ($combined -match 'review.?summary') {
      Write-Host "check-phase8j-no-mutation-routes: FAILED - mutation route in Phase 8J section at line $lineNum"
      Write-Host "  $line"
      exit 1
    }
  }
}

Write-Host "check-phase8j-no-mutation-routes: passed"
