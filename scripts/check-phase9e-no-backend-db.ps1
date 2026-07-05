# Phase 9E gate: validate system runtime behavior, not file immutability.
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

const customerHeaders = {
  "x-xlb-app-type": "customer",
  "x-xlb-role": "customer",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9e-gate-customer",
  "x-xlb-trace-id": "phase9e-gate-customer",
};

const operatorHeaders = {
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9e-gate-operator",
  "x-xlb-trace-id": "phase9e-gate-operator",
};

const failures = [];

async function expectStatus({ label, method, url, headers, payload, expected }) {
  const response = await app.inject({ method, url, headers, payload });
  if (!expected.includes(response.statusCode)) {
    failures.push(`${label}: expected ${expected.join("/")} but got ${response.statusCode}`);
  }
  if (response.statusCode === 404) {
    failures.push(`${label}: route returned 404; expected registered runtime behavior`);
  }
  if (response.statusCode === 500) {
    failures.push(`${label}: route returned 500 (runtime/system crash)`);
  }
  return response;
}

await expectStatus({
  label: "order create route reaches domain validation",
  method: "POST",
  url: "/api/orders",
  headers: customerHeaders,
  payload: {
    customerId: "phase9e-gate-customer",
    skuId: "demo_cleaning_forbidden_gate",
    quantity: 1,
  },
  expected: [400],
});

await expectStatus({
  label: "ledger accruals rejects non-operator at runtime",
  method: "GET",
  url: "/api/internal/ledger/accruals",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "ledger run-once rejects non-operator at runtime",
  method: "POST",
  url: "/api/internal/ledger/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "settlement batches rejects non-operator at runtime",
  method: "GET",
  url: "/api/internal/settlement/batches",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "settlement batches read path responds under operator context",
  method: "GET",
  url: "/api/internal/settlement/batches",
  headers: operatorHeaders,
  expected: [200],
});

await expectStatus({
  label: "settlement statement audit list returns data or validation response",
  method: "GET",
  url: "/api/internal/settlement/worker-statement-audit?cityCode=hangzhou&limit=1",
  headers: operatorHeaders,
  expected: [200],
});

await app.close();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

process.exit(0);
'@ -replace "__APP_URI__", $appUri

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9e-runtime-behavior-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
  Set-Content -LiteralPath $runtimeFile -Value $runtimeCheck -Encoding UTF8

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runtimeOutput = & pnpm --filter "@xlb/backend" exec tsx $runtimeFile 2>&1
    $runtimeExit = $LASTEXITCODE
    if ($runtimeExit -ne 0) {
      Add-Failure "Fastify runtime system/backend behavior check failed"
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
  Write-Host "check-phase9e-no-backend-db: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9e-no-backend-db: passed (runtime backend behavior validated)"
