# Phase 8K gate: fixed path /settlement-audit-summary must be registered (no parameterized sibling needed)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8k-route-order: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Find the Phase 8K section
$phase8KSectionStart = $content.IndexOf("// ── Phase 8K:")
if ($phase8KSectionStart -eq -1) {
  # Try alternate marker format
  $phase8KSectionStart = $content.IndexOf("Phase 8K")
  if ($phase8KSectionStart -eq -1) {
    Write-Host "check-phase8k-route-order: FAILED - Phase 8K section not found in settlementRoutes.ts"
    exit 1
  }
}

# Use whole file if Phase 8K marker not strictly delineated, but prefer section-scoped check
$checkSection = $content.Substring($phase8KSectionStart)

# Find the fixed path within the Phase 8K section
$fixedPath = '"/api/internal/settlement/settlement-audit-summary"'

$fixedPos = $checkSection.IndexOf($fixedPath)

if ($fixedPos -eq -1) {
  Write-Host "check-phase8k-route-order: FAILED - fixed path not found"
  exit 1
}

# Phase 8K has only one route (no parameterized sibling) — this is valid
# No order comparison needed since there's only a single fixed path

Write-Host "check-phase8k-route-order: passed"
