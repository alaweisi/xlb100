$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(
  "backend/src/settlement/settlementPayableQueueService.ts",
  "backend/src/settlement/settlementRepository.ts",
  "db/migrations/016_settlement_payable_queue.sql"
)
$Text = ($Files | ForEach-Object { Get-Content -Raw (Join-Path $Root $_) }) -join "`n"
if ($Text -match '(?i)INSERT\s+INTO\s+ledger_entries|UPDATE\s+ledger_entries|insertEntry\s*\(') { throw "Settlement payable queue must not write ledger entries." }
Write-Host "PASS: settlement payable queue does not write ledger entries."
