# Phase 9B gate: validate admin-only settlement statement behavior at runtime.
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
  "x-xlb-user-id": "phase9b-gate-operator",
  "x-xlb-trace-id": "phase9b-gate-operator",
};

const customerHeaders = {
  "x-xlb-app-type": "customer",
  "x-xlb-role": "customer",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9b-gate-customer",
  "x-xlb-trace-id": "phase9b-gate-customer",
};

const workerHeaders = {
  "x-xlb-app-type": "worker",
  "x-xlb-role": "worker",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9b-gate-worker",
  "x-xlb-trace-id": "phase9b-gate-worker",
};

const failures = [];

async function expectStatus({ label, method, url, headers, payload, expected }) {
  const response = await app.inject({ method, url, headers, payload });
  if (!expected.includes(response.statusCode)) {
    failures.push(`${label}: expected ${expected.join("/")} but got ${response.statusCode}`);
  }
  return response;
}

await expectStatus({
  label: "operator statement review validation reaches handler",
  method: "POST",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_gate/review-once",
  headers: operatorHeaders,
  payload: {},
  expected: [400],
});

await expectStatus({
  label: "customer blocked from statement detail",
  method: "GET",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_gate",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "worker blocked from statement detail",
  method: "GET",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_gate",
  headers: workerHeaders,
  expected: [403],
});

await expectStatus({
  label: "customer blocked from statement review",
  method: "POST",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_gate/review-once",
  headers: customerHeaders,
  payload: {},
  expected: [403],
});

await expectStatus({
  label: "worker blocked from statement export",
  method: "POST",
  url: "/api/internal/settlement/worker-statements/stmt_phase9b_gate/export-once",
  headers: workerHeaders,
  payload: {},
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

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9b-admin-only-scope-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
  Set-Content -LiteralPath $runtimeFile -Value $runtimeCheck -Encoding UTF8

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runtimeOutput = & pnpm --filter "@xlb/backend" exec tsx $runtimeFile 2>&1
    $runtimeExit = $LASTEXITCODE
    if ($runtimeExit -ne 0) {
      Add-Failure "Fastify runtime admin scope check failed"
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
  Write-Host "check-phase9b-admin-only-scope: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9b-admin-only-scope: passed (runtime admin scope validated)"
