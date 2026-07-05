# Phase 9A gate: validate preparation route behavior, not repository diff shape.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
  param([Parameter(Mandatory = $true)][string]$Message)
  $failures.Add($Message) | Out-Null
}

$appFile = Join-Path $Root "backend\src\app.ts"
if (-not (Test-Path $appFile)) {
  Add-Failure "missing backend app file: $appFile"
}

if ($failures.Count -eq 0) {
  $appUri = ([System.Uri]$appFile).AbsoluteUri
  $runtimeCheck = @'
const { buildApp } = await import("__APP_URI__");

const app = await buildApp();
const probes = [
  ["POST", "/api/internal/settlement-action-governance/preparation-envelopes"],
  ["POST", "/api/internal/settlement-action-governance/preparation-envelopes/env_route_gate/freeze"],
  ["POST", "/api/internal/settlement-action-governance/preparation-envelopes/env_route_gate/approve"],
  ["GET", "/api/internal/settlement-action-governance/preparation-envelopes"],
  ["GET", "/api/internal/settlement-action-governance/preparation-envelopes/env_route_gate"],
  ["GET", "/api/internal/settlement-action-governance/preparation-envelopes/env_route_gate/items"],
  ["GET", "/api/internal/settlement-action-governance/preparation-envelopes/env_route_gate/audit"],
];

const missing = [];
for (const [method, url] of probes) {
  const response = await app.inject({ method, url });
  if (response.statusCode === 404) {
    missing.push([method, url]);
  }
}

await app.close();

if (missing.length > 0) {
  for (const [method, url] of missing) {
    console.error(`missing runtime route: ${method} ${url}`);
  }
  process.exit(1);
}
'@ -replace "__APP_URI__", $appUri

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9a-route-order-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
  Set-Content -LiteralPath $runtimeFile -Value $runtimeCheck -Encoding UTF8

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runtimeOutput = & pnpm --filter "@xlb/backend" exec tsx $runtimeFile 2>&1
    $runtimeExit = $LASTEXITCODE
    if ($runtimeExit -ne 0) {
      Add-Failure "Fastify runtime route dispatch check failed"
      $runtimeOutput | ForEach-Object {
        if ("$_".Trim().Length -gt 0) {
          Add-Failure "runtime: $_"
        }
      }
    }
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
    if (Test-Path $runtimeFile) {
      Remove-Item -LiteralPath $runtimeFile -Force
    }
  }
}

if ($failures.Count -gt 0) {
  Write-Host "check-phase9a-route-order: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9a-route-order: passed (runtime route behavior validated)"
