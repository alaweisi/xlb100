$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
if ($Service -match 'ledger_entries|insertLedger|LedgerEntry') { throw "Phase 8G must not write ledger entries." }
Write-Host "PASS: worker receivable statement reviews have no ledger entry scope."
