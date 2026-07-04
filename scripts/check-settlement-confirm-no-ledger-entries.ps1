$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(
  "backend/src/settlement/settlementConfirmationService.ts",
  "backend/src/settlement/settlementRepository.ts",
  "db/migrations/014_settlement_confirmation.sql"
)
$Text = ($Files | ForEach-Object { Get-Content -Raw (Join-Path $Root $_) }) -join "`n"
if ($Text -match '(?i)INSERT\s+INTO\s+ledger_entries|UPDATE\s+ledger_entries|insertEntry\s*\(') { throw "Settlement confirmation must not write ledger entries." }
Write-Host "PASS: settlement confirmation does not write ledger entries."
