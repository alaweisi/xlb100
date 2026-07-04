$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$State = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementStateMachine.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/014_settlement_confirmation.sql")
if ($State -notmatch 'status === "prepared"') { throw "Only prepared batches may enter confirmation." }
if ($Repo -notmatch "status = 'confirmed'[\s\S]*status = 'prepared'") { throw "Confirmation update must be prepared-only." }
if ($Migration -match "'paid'|'payable'|'closed'") { throw "Phase 8C migration contains a forbidden state." }
Write-Host "PASS: Phase 8C allows prepared to confirmed only."
