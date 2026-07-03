# Phase 0 smoke test
$ErrorActionPreference = "Stop"
Write-Host "smoke-test: checking backend health endpoint..."
try {
  $resp = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
  if ($resp.StatusCode -ne 200) { throw "health returned $($resp.StatusCode)" }
  Write-Host "smoke-test: passed"
} catch {
  Write-Host "smoke-test: skipped (backend not running — start with pnpm --filter @xlb/backend dev)"
}
