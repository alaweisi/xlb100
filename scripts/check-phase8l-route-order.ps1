# Phase 8L gate: fixed path /reconciliation-gap-scan must be registered (no parameterized sibling needed)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8l-route-order: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Find the Phase 8L section
$phase8LSectionStart = $content.IndexOf("// ── Phase 8L:")
if ($phase8LSectionStart -eq -1) {
  # Try alternate marker format
  $phase8LSectionStart = $content.IndexOf("Phase 8L")
  if ($phase8LSectionStart -eq -1) {
    Write-Host "check-phase8l-route-order: FAILED - Phase 8L section not found in settlementRoutes.ts"
    exit 1
  }
}

# Use whole file if Phase 8L marker not strictly delineated, but prefer section-scoped check
$checkSection = $content.Substring($phase8LSectionStart)

# Find the fixed path within the Phase 8L section
$fixedPath = '"/api/internal/settlement/reconciliation-gap-scan"'

$fixedPos = $checkSection.IndexOf($fixedPath)

if ($fixedPos -eq -1) {
  Write-Host "check-phase8l-route-order: FAILED - fixed path not found"
  exit 1
}

# Phase 8L has only one route (no parameterized sibling) — this is valid
# No order comparison needed since there's only a single fixed path

Write-Host "check-phase8l-route-order: passed"
