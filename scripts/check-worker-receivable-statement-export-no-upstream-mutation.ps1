$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
$Forbidden = @(
  'UPDATE orders', 'UPDATE payment', 'UPDATE fulfillments', 'UPDATE ledger_accruals',
  'UPDATE settlement_payable_queue[\s\S]*status', 'UPDATE settlement_payables[\s\S]*status',
  'UPDATE settlement_batches[\s\S]*status', 'UPDATE worker_receivable_statement_reviews',
  'UPDATE worker_receivable_statement_lines', 'UPDATE worker_receivable_statements[\s\S]*status'
)
foreach ($pattern in $Forbidden) {
  if ($Service -match $pattern) { throw "Phase 8H must not mutate upstream or settlement status: $pattern" }
}
Write-Host "PASS: worker receivable statement exports do not mutate upstream state."
