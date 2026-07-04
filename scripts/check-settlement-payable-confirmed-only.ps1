$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementPayableService.ts")
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
if ($State -notmatch 'canMarkSettlementPayable[\s\S]*status === "confirmed"') { throw "Payable readiness must require confirmed batches." }
if ($Service -notmatch 'assertSettlementPayableReady') { throw "Payable service must assert confirmed-only input." }
if ($Service -match 'status === "prepared"[\s\S]*markSettlementPayable') { throw "Prepared batches must not be marked payable." }
Write-Host "PASS: settlement payable readiness accepts confirmed batches only."
