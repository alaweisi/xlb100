$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content -Raw (Join-Path $Root "backend/src/settlement/settlementRepository.ts")
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/013_settlement_preparation_foundation.sql")
if ($Repo -notmatch 'assertCityScopedContext' -or $Repo -notmatch 'buildCityScopedWhere') { throw "Settlement repository must enforce city scope." }
if (($Migration | Select-String -Pattern "city_code <> '__global__'" -AllMatches).Matches.Count -ne 2) { throw "Both settlement tables must reject __global__." }
if ($Repo -notmatch 'si\.city_code = la\.city_code') { throw "Accrual exclusion must remain city scoped." }
Write-Host "PASS: settlement batches, items, and queries are city scoped."
