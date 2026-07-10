$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$required = @(
  "tests/integration/phase22CrossPhaseE2E.test.ts",
  "tests/security/phase22AuthorizationMatrix.test.ts",
  "tests/performance/phase22ConcurrencyGates.test.ts",
  ".github/workflows/phase22-quality-gates.yml",
  "infra/observability/phase22-alert-rules.yml"
)
foreach ($path in $required) {
  if (-not (Test-Path (Join-Path $Root $path))) { throw "missing Phase 22 artifact: $path" }
}

$workflow = Get-Content (Join-Path $Root ".github/workflows/phase22-quality-gates.yml") -Raw
if ($workflow -notmatch "pnpm gate:phase22") { throw "Phase 22 workflow does not invoke the blocking gate" }
$providerFiles = @(
  "backend/src/dispatch/geoProvider.ts",
  "backend/src/providers/objectStorage/objectStorageProvider.ts"
) | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path $_ }
foreach ($file in $providerFiles) {
  $content = Get-Content $file -Raw
  if ($content -match "fetch\(|axios|https://maps|restapi.amap") { throw "real external provider execution found in $file" }
}

Write-Host "check-phase22-boundaries: passed"
