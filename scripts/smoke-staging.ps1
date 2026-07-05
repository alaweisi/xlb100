# Staging smoke test (backend + frontend endpoints)
$ErrorActionPreference = "Stop"

$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "3000" }
$customerPort = if ($env:CUSTOMER_PORT) { $env:CUSTOMER_PORT } else { "4173" }
$workerPort = if ($env:WORKER_PORT) { $env:WORKER_PORT } else { "4174" }
$adminPort = if ($env:ADMIN_PORT) { $env:ADMIN_PORT } else { "4175" }

$checks = @(
  @{ Name = "backend health"; Url = "http://localhost:$backendPort/health" },
  @{ Name = "backend db-health"; Url = "http://localhost:$backendPort/api/system/db-health" },
  @{ Name = "customer"; Url = "http://localhost:$customerPort/" },
  @{ Name = "worker"; Url = "http://localhost:$workerPort/" },
  @{ Name = "admin"; Url = "http://localhost:$adminPort/" }
)

foreach ($check in $checks) {
  Write-Host "smoke-staging: checking $($check.Name) -> $($check.Url)"
  try {
    $resp = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 10
    if ($resp.StatusCode -ne 200) {
      throw "status $($resp.StatusCode)"
    }
  } catch {
    Write-Host "smoke-staging: FAILED ($($check.Name)): $($_.Exception.Message)"
    exit 1
  }
}

Write-Host "smoke-staging: passed"
