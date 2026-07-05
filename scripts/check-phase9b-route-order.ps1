# Phase 9B gate: validate statement drilldown route dispatch at runtime.
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

const operatorHeaders = {
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9b-route-gate-operator",
  "x-xlb-trace-id": "phase9b-route-gate-operator",
};

const invalidCityOperatorHeaders = {
  ...operatorHeaders,
  "x-xlb-city-code": "__invalid_city__",
  "x-xlb-trace-id": "phase9b-route-gate-invalid-city",
};

const customerHeaders = {
  "x-xlb-app-type": "customer",
  "x-xlb-role": "customer",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9b-route-gate-customer",
  "x-xlb-trace-id": "phase9b-route-gate-customer",
};

const failures = [];

async function expectStatus({ label, method, url, headers, expected }) {
  const response = await app.inject({ method, url, headers });
  if (!expected.includes(response.statusCode)) {
    failures.push(`${label}: expected ${expected.join("/")} but got ${response.statusCode}`);
  }
  if (response.statusCode === 404) {
    failures.push(`${label}: route returned 404; expected registered route dispatch with runtime rejection`);
  }
  return response;
}

await expectStatus({
  label: "audit list route dispatches to query validation",
  method: "GET",
  url: "/api/internal/settlement/worker-statement-audit?limit=999",
  headers: operatorHeaders,
  expected: [400],
});

await expectStatus({
  label: "audit list route rejects invalid city at runtime",
  method: "GET",
  url: "/api/internal/settlement/worker-statement-audit",
  headers: invalidCityOperatorHeaders,
  expected: [400],
});

await expectStatus({
  label: "audit detail route rejects invalid city at runtime",
  method: "GET",
  url: "/api/internal/settlement/worker-statement-audit/stmt_phase9b_route_gate",
  headers: invalidCityOperatorHeaders,
  expected: [400],
});

await expectStatus({
  label: "statement detail route rejects invalid city at runtime",
  method: "GET",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_route_gate",
  headers: invalidCityOperatorHeaders,
  expected: [400],
});

await expectStatus({
  label: "customer is rejected by statement detail route dispatch",
  method: "GET",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_route_gate",
  headers: customerHeaders,
  expected: [403],
});

await app.close();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
'@ -replace "__APP_URI__", $appUri

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9b-route-order-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
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
  Write-Host "check-phase9b-route-order: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9b-route-order: passed (runtime route dispatch validated)"
