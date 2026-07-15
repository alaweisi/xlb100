Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..'))
node scripts/check-contracts.mjs
if ($LASTEXITCODE -ne 0) {
  throw "check-contracts failed (exit $LASTEXITCODE)"
}
