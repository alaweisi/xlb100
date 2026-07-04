# Phase 8J gate: fixed path /worker-statement-review-summary must be registered before any parameterized path under same prefix
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-phase8j-route-order: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Find the Phase 8J section
$phase8JSectionStart = $content.IndexOf("// ── Phase 8J:")
if ($phase8JSectionStart -eq -1) {
  # Try alternate marker format
  $phase8JSectionStart = $content.IndexOf("Phase 8J")
  if ($phase8JSectionStart -eq -1) {
    Write-Host "check-phase8j-route-order: FAILED - Phase 8J section not found in settlementRoutes.ts"
    exit 1
  }
}

# Use whole file if Phase 8J marker not strictly delineated, but prefer section-scoped check
$checkSection = $content.Substring($phase8JSectionStart)

# Find positions of the two routes within the Phase 8J section
$fixedPath = '"/api/internal/settlement/worker-statement-review-summary"'
$paramPath = '"/api/internal/settlement/worker-statement-review-summary/:statementId"'

$fixedPos = $checkSection.IndexOf($fixedPath)
$paramPos = $checkSection.IndexOf($paramPath)

if ($fixedPos -eq -1) {
  Write-Host "check-phase8j-route-order: FAILED - fixed path not found"
  exit 1
}

# Phase 8J has only one route (no parameterized sibling) — this is valid
if ($paramPos -ne -1 -and $fixedPos -ge $paramPos) {
  Write-Host "check-phase8j-route-order: FAILED - fixed path registered AFTER parameterised path"
  Write-Host "  Fixed path must come first to avoid Fastify route ambiguity"
  exit 1
}

Write-Host "check-phase8j-route-order: passed"
