$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/019_worker_receivable_statement_export.sql")
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementExportService.ts")
if ($Migration -match '(?i)CREATE TABLE payout|\bpaid\b|withdraw|payment_instruction') { throw "Phase 8H migration must not introduce payout/paid semantics." }
if ($Service -match '(?i)settlement\.paid|payout|withdraw|payment_instruction') { throw "Phase 8H must not implement payout or paid settlement." }
Write-Host "PASS: worker receivable statement exports have no payout or paid settlement scope."
