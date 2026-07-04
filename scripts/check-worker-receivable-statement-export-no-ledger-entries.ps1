$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
if ($Service -match 'ledger_entries|insertLedger|LedgerEntry') { throw "Phase 8H must not write ledger entries." }
Write-Host "PASS: worker receivable statement exports have no ledger entry scope."
