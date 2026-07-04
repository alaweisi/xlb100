# Phase 8I gate: fixed path /worker-statement-audit must be registered before /worker-statement-audit/:statementId
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$routesFile = Join-Path $Root "backend\src\settlement\settlementRoutes.ts"
if (-not (Test-Path $routesFile)) {
  Write-Host "check-worker-receivable-statement-audit-route-order: FAILED - settlementRoutes.ts missing"
  exit 1
}

$content = Get-Content $routesFile -Raw

# Find the audit section
$auditSectionStart = $content.IndexOf("// ── Phase 8I: Audit Query Routes ──")
if ($auditSectionStart -eq -1) {
  Write-Host "check-worker-receivable-statement-audit-route-order: FAILED - Phase 8I section not found"
  exit 1
}

$auditSection = $content.Substring($auditSectionStart)

# Find positions of the two routes
$fixedPath = '"/api/internal/settlement/worker-statement-audit"'
$paramPath = '"/api/internal/settlement/worker-statement-audit/:statementId"'

$fixedPos = $auditSection.IndexOf($fixedPath)
$paramPos = $auditSection.IndexOf($paramPath)

if ($fixedPos -eq -1 -or $paramPos -eq -1) {
  Write-Host "check-worker-receivable-statement-audit-route-order: FAILED - could not find both audit routes"
  if ($fixedPos -eq -1) { Write-Host "  Missing fixed path: $fixedPath" }
  if ($paramPos -eq -1) { Write-Host "  Missing parameterised path: $paramPath" }
  exit 1
}

if ($fixedPos -ge $paramPos) {
  Write-Host "check-worker-receivable-statement-audit-route-order: FAILED - fixed path registered AFTER parameterised path"
  Write-Host "  Fixed path must come first to avoid Fastify route ambiguity"
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-route-order: passed"
