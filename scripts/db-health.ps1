# Check Docker containers and backend db-health endpoint
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

Write-Host "Checking docker compose..."
docker compose -f (Join-Path $Root "deploy\compose\docker-compose.local.yml") ps

Write-Host "Checking backend /api/system/db-health..."
try {
  $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/system/db-health" -TimeoutSec 10
  $resp | ConvertTo-Json -Compress
  if (-not $resp.ok) {
    Write-Host "db-health: FAILED"
    exit 1
  }
  Write-Host "db-health: passed"
} catch {
  Write-Host "db-health: backend not reachable — $($_.Exception.Message)"
  exit 1
}
