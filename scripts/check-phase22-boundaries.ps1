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
$blockingCommands = @(
  "pnpm test:e2e:phase22",
  "pnpm test:security:phase22",
  "pnpm test:observability:phase22",
  "pnpm test:performance:phase22",
  "pnpm test:coverage:phase22",
  "pnpm audit:critical"
)
foreach ($command in $blockingCommands) {
  if ($workflow -notmatch [regex]::Escape($command)) { throw "Phase 22 workflow is missing blocking command: $command" }
}
if ($workflow -match "continue-on-error") { throw "Phase 22 workflow must not permit quality-gate failures" }
if ($workflow -match "XLB_PHASE22_FORCE_FAILURE") { throw "Phase 22 delivery workflow must not contain failure injection" }
$providerFiles = @(
  "backend/src/dispatch/geoProvider.ts",
  "backend/src/providers/objectStorage/objectStorageProvider.ts"
) | ForEach-Object { Join-Path $Root $_ } | Where-Object { Test-Path $_ }
foreach ($file in $providerFiles) {
  $content = Get-Content $file -Raw
  if ($content -match "fetch\(|axios|https://maps|restapi.amap") { throw "real external provider execution found in $file" }
}

Write-Host "check-phase22-boundaries: passed"
