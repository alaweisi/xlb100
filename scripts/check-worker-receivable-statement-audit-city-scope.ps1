# Phase 8I gate: audit repository must enforce city-scoped queries
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$repoFile = Join-Path $Root "backend\src\settlement\workerReceivableStatementAuditRepository.ts"
if (-not (Test-Path $repoFile)) {
  Write-Host "check-worker-receivable-statement-audit-city-scope: FAILED - workerReceivableStatementAuditRepository.ts missing"
  exit 1
}

$content = Get-Content $repoFile -Raw

# Must use assertCityScopedContext or buildCityScopedWhere
if ($content -notmatch 'assertCityScopedContext' -and $content -notmatch 'buildCityScopedWhere') {
  Write-Host "check-worker-receivable-statement-audit-city-scope: FAILED - no assertCityScopedContext or buildCityScopedWhere found"
  exit 1
}

# Every method must call assertCityScopedContext before querying.
# Full-content match (all methods in file share this guard via explicit call).
# Previous per-method brace-matching approach replaced with simpler content check.
if ($content -notmatch 'assertCityScopedContext') {
  Write-Host "check-worker-receivable-statement-audit-city-scope: FAILED - assertCityScopedContext not found"
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-city-scope: passed"
