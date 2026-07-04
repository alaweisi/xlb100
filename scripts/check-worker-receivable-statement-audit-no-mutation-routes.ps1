# Phase 8I gate: audit routes must be read-only (app.get only)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-worker-receivable-statement-audit-no-mutation-routes: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Find the audit route section (Phase 8I marker), then check for mutation methods
$auditSection = $content -replace '(?s).*// ── Phase 8I: Audit Query Routes ──', '// ── Phase 8I: Audit Query Routes ──'
$auditSection = $auditSection -replace '(?s)(// ── Phase 8I: Audit Query Routes ──.*)()', '$1'

# Check for app.post/put/patch/delete within audit path routes
$mutationPatterns = @(
  'app\.post\s*\([^)]*statement.*audit',
  'app\.put\s*\([^)]*statement.*audit',
  'app\.patch\s*\([^)]*statement.*audit',
  'app\.delete\s*\([^)]*statement.*audit',
  'app\.post\s*\([^)]*audit',
  'app\.put\s*\([^)]*audit',
  'app\.patch\s*\([^)]*audit',
  'app\.delete\s*\([^)]*audit'
)

$violations = @()
foreach ($pattern in $mutationPatterns) {
  if ($content -match $pattern) {
    $violations += "found mutation route matching: $pattern"
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-no-mutation-routes: FAILED"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

# Verify the Phase 8I section only uses app.get for audit routes
$lines = Get-Content $routesFile
$inPhase8I = $false
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  if ($line -match 'Phase 8I') { $inPhase8I = $true; continue }
  if ($inPhase8I -and $line -match '^\s*app\.(post|put|patch|delete)\s*\(') {
    # Only flag if the route path contains "audit"
    $nextLine = $lines[$lineNum]  # 0-based index, lineNum is 1-based
    if (-not $nextLine) { $nextLine = "" }
    $combined = $line + " " + $nextLine
    if ($combined -match 'audit') {
      Write-Host "check-worker-receivable-statement-audit-no-mutation-routes: FAILED - mutation route in Phase 8I section at line $lineNum"
      Write-Host "  $line"
      exit 1
    }
  }
}

Write-Host "check-worker-receivable-statement-audit-no-mutation-routes: passed"
