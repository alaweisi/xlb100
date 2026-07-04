$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Service = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementService.ts")
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/workerReceivableStatementRepository.ts")
if ($Service -match '(?i)INSERT INTO ledger_entries|UPDATE ledger_entries') { throw "Statements must not write ledger entries." }
if ($Repo -match '(?i)ledger_entries') { throw "Statement repository must not touch ledger entries." }
Write-Host "PASS: worker receivable statements do not write ledger entries."
