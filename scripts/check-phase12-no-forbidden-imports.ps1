# Phase 12 gate: no forbidden imports in preparation module
$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$forbiddenImports = @('paymentOrderService','paymentOrderRepository','ledgerAccrualService','ledgerRepository','settlementConfirmationService','settlementPayableService','settlementPayableQueueService','workerReceivableStatementExportService','providerService','refundService','reversalService')
$changedFiles = & git -C $Root diff --name-only main...HEAD 2>$null
$violations = @()
foreach ($file in $changedFiles) {
  if ($file -match 'docs/|tests/|scripts/') { continue }
  if ($file -notmatch '\.(ts|tsx)$') { continue }
  $fullPath = Join-Path $Root $file; if (-not (Test-Path $fullPath)) { continue }
  $content = Get-Content $fullPath -Raw
  foreach ($imp in $forbiddenImports) { if ($content -match "import.*$imp|require.*$imp|from.*$imp") { $violations += "$file imports $imp" } }
}
if ($violations.Count -gt 0) { Write-Host "check-phase12-no-forbidden-imports: FAILED - forbidden imports found"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase12-no-forbidden-imports: passed"
