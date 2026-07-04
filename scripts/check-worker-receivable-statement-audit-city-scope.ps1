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

# Every public method should use city scope
# Check that 'city_code =' in SQL is not used without city scoping functions
# (This is a soft check - the actual enforcement is via assertCityScopedContext)
$methods = @(
  'listStatementAudit',
  'getStatementAuditDetail',
  'listExportAudit'
)

$unscopedMethods = @()
foreach ($method in $methods) {
  # Find the method body
  $methodStart = $content.IndexOf("async $method(")
  if ($methodStart -eq -1) {
    $methodStart = $content.IndexOf("$method(")
  }
  if ($methodStart -eq -1) {
    $unscopedMethods += "$method (not found)"
    continue
  }
  $methodBody = $content.Substring($methodStart)
  # Check up to the closing brace of the method (rough check)
  $braceCount = 0
  $methodEnd = -1
  for ($i = 0; $i -lt $methodBody.Length; $i++) {
    if ($methodBody[$i] -eq '{') { $braceCount++ }
    if ($methodBody[$i] -eq '}') { 
      $braceCount--
      if ($braceCount -eq 0) { $methodEnd = $i; break }
    }
  }
  if ($methodEnd -gt 0) {
    $methodBody = $methodBody.Substring(0, $methodEnd + 1)
  }
  if ($methodBody -notmatch 'assertCityScopedContext') {
    $unscopedMethods += "$method (missing assertCityScopedContext)"
  }
}

if ($unscopedMethods.Count -gt 0) {
  Write-Host "check-worker-receivable-statement-audit-city-scope: FAILED"
  $unscopedMethods | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-city-scope: passed"
