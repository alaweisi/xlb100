$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/017_worker_receivable_statement.sql")
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
if ($Migration -match '(?i)CREATE TABLE payout|\bpaid\b|withdraw|payment_instruction') { throw "Phase 8F migration must not introduce payout/paid semantics." }
if ($Service -match '(?i)settlement\.paid|payout|withdraw|payment_instruction') { throw "Phase 8F must not implement payout or paid settlement." }
Write-Host "PASS: worker receivable statements have no payout or paid settlement scope."
