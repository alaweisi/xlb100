$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(
  "backend/src/settlement/settlementPayableService.ts",
  "backend/src/settlement/settlementRepository.ts",
  "db/migrations/015_settlement_payable_readiness.sql"
)
$Text = ($Files | ForEach-Object { Get-Content -Raw (Join-Path $Root $_) }) -join "`n"
if ($Text -match '(?i)INSERT\s+INTO\s+ledger_entries|UPDATE\s+ledger_entries|insertEntry\s*\(') { throw "Settlement payable readiness must not write ledger entries." }
Write-Host "PASS: settlement payable readiness does not write ledger entries."
