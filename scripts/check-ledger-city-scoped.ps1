$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/ledger/ledgerRepository.ts")
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/012_ledger_accrual_foundation.sql")
if ($Repo -notmatch 'assertCityScopedContext' -or $Repo -notmatch 'buildCityScopedWhere') { throw "Ledger repository must enforce city scope." }
if (($Migration | Select-String -Pattern "city_code <> '__global__'" -AllMatches).Matches.Count -ne 3) { throw "Every Phase 8A ledger table must reject __global__." }
Write-Host "PASS: ledger is city scoped and rejects __global__."
