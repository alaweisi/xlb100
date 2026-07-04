# Phase 8K gate: settlement audit summary routes must be read-only (app.get only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8k-no-mutation-routes: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Check for app.post/put/patch/delete within Phase 8K settlement audit summary path routes
$mutationPatterns = @(
  'app\.post\s*\([^)]*audit.?summary',
  'app\.put\s*\([^)]*audit.?summary',
  'app\.patch\s*\([^)]*audit.?summary',
  'app\.delete\s*\([^)]*audit.?summary',
  'app\.post\s*\([^)]*SettlementAuditSummary',
  'app\.put\s*\([^)]*SettlementAuditSummary',
  'app\.patch\s*\([^)]*SettlementAuditSummary',
  'app\.delete\s*\([^)]*SettlementAuditSummary'
)

$violations = @()
foreach ($pattern in $mutationPatterns) {
  if ($content -match $pattern) {
    $violations += "found mutation route matching: $pattern"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase8k-no-mutation-routes: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Verify the Phase 8K section only uses app.get for audit summary routes
$lines = Get-Content $routesFile
$inPhase8K = $false
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  if ($line -match 'Phase 8K') { $inPhase8K = $true; continue }
  if ($inPhase8K -and $line -match '^\s*app\.(post|put|patch|delete)\s*\(') {
    # Only flag if the route path contains "audit-summary"
    $nextLine = $lines[$lineNum]  # 0-based index, lineNum is 1-based
    if (-not $nextLine) { $nextLine = "" }
    $combined = $line + " " + $nextLine
    if ($combined -match 'audit.?summary') {
      Write-Host "check-phase8k-no-mutation-routes: FAILED - mutation route in Phase 8K section at line $lineNum"
      Write-Host "  $line"
      exit 1
    }
  }
}

Write-Host "check-phase8k-no-mutation-routes: passed"
