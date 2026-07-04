$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/018_worker_receivable_statement_review.sql")
$Forbidden = @('refund', 'aftersale', 'reversal', 'ledger_reversal', 'settlement_reversal')
foreach ($term in $Forbidden) {
  if ($Service -match "(?i)$term" -and $Service -notmatch "must not|no $term|without $term") {
    throw "Phase 8G must not implement $term semantics."
  }
  if ($Migration -match "(?i)$term") { throw "Phase 8G migration must not reference $term." }
}
Write-Host "PASS: worker receivable statement reviews have no refund/aftersale/reversal scope."
