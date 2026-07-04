$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/018_worker_receivable_statement_review.sql")
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementReviewService.ts")
if ($Migration -match '(?i)CREATE TABLE payout|\bpaid\b|withdraw|payment_instruction') { throw "Phase 8G migration must not introduce payout/paid semantics." }
if ($Service -match '(?i)settlement\.paid|payout|withdraw|payment_instruction') { throw "Phase 8G must not implement payout or paid settlement." }
Write-Host "PASS: worker receivable statement reviews have no payout or paid settlement scope."
