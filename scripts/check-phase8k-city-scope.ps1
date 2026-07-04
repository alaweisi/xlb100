# Phase 8K gate: settlement audit summary repository must enforce city-scoped queries
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$repoFile = Join-Path $Root "backend\src\settlement\SettlementAuditSummaryRepository.ts"
if (-not (Test-Path $repoFile)) {
  Write-Host "check-phase8k-city-scope: FAILED - SettlementAuditSummaryRepository.ts missing"
  exit 1
}

$content = Get-Content $repoFile -Raw

# Must use assertCityScopedContext
if ($content -notmatch 'assertCityScopedContext') {
  Write-Host "check-phase8k-city-scope: FAILED - assertCityScopedContext not found in repository"
  exit 1
}

Write-Host "check-phase8k-city-scope: passed"
