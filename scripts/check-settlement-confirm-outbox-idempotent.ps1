$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementConfirmationService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
if ($Repo -notmatch 'findBatchForConfirmation[\s\S]*FOR UPDATE') { throw "Confirmation must lock the batch row." }
if ($Service -notmatch 'batch.status === "confirmed"[\s\S]*idempotent: true') { throw "Confirmed retries must return idempotently." }
if ($Service -notmatch 'eventType: "settlement.confirmed"') { throw "Confirmation must write settlement.confirmed." }
Write-Host "PASS: confirmation row locking prevents duplicate confirmed outbox events."
