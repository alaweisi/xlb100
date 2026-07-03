# Phase 7B gate: lifecycle lock and writes require fulfillment, city, and worker scope.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Repo = Get-Content (Join-Path $Root "backend\src\fulfillment\fulfillmentRepository.ts") -Raw
$Service = Get-Content (Join-Path $Root "backend\src\fulfillment\fulfillmentService.ts") -Raw
$Routes = Get-Content (Join-Path $Root "backend\src\fulfillment\fulfillmentRoutes.ts") -Raw

$Failures = @()
if ($Repo -notmatch "fulfillment_id\s*=\s*\?\s+AND\s+city_code\s*=\s*\?\s+AND\s+worker_id\s*=\s*\?") { $Failures += "repository lifecycle lock is not city + worker scoped" }
if (($Repo | Select-String -Pattern "WHERE fulfillment_id = \? AND city_code = \? AND worker_id = \?" -AllMatches).Matches.Count -lt 3) { $Failures += "start/complete updates are not both city + worker scoped" }
if ($Service -notmatch "assertCityScopedContext\(context\)" -or $Service -notmatch "context\.userId") { $Failures += "service does not derive city/worker from RequestContext" }
if ($Routes -notmatch 'appType\s*!==\s*"worker"' -or $Routes -notmatch 'role\s*!==\s*"worker"') { $Failures += "routes lack worker app/role guard" }
if ($Failures.Count -gt 0) { Write-Host "check-fulfillment-city-worker-scoped FAILED:"; $Failures | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-fulfillment-city-worker-scoped: passed"
