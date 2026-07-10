# Phase 9C gate: validate core runtime behavior, not backend file immutability.
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
$tokenFile = Join-Path $Root "backend\src\auth\tokenAuth.ts"
if (-not (Test-Path $tokenFile)) {
  Add-Failure "missing backend token auth file: $tokenFile"
}
$tsxCommand = Join-Path $Root "backend\node_modules\.bin\tsx.cmd"
if (-not (Test-Path $tsxCommand)) {
  Add-Failure "missing backend tsx command: $tsxCommand"
}

if ($failures.Count -eq 0) {
  $appUri = ([System.Uri]$appFile).AbsoluteUri
  $tokenUri = ([System.Uri]$tokenFile).AbsoluteUri
  $runtimeCheck = @'
const { buildApp } = await import("__APP_URI__");
const { createToken } = await import("__TOKEN_URI__");

const app = await buildApp();

const customerHeaders = {
  authorization: `Bearer ${createToken("phase9c-gate-customer", "customer", "customer")}`,
  "x-xlb-city-code": "hangzhou",
  "x-xlb-trace-id": "phase9c-gate-customer",
};

const operatorHeaders = {
  authorization: `Bearer ${createToken("phase9c-gate-operator", "operator", "admin")}`,
  "x-xlb-city-code": "hangzhou",
  "x-xlb-trace-id": "phase9c-gate-operator",
};

const invalidCityOperatorHeaders = {
  ...operatorHeaders,
  "x-xlb-city-code": "__invalid_city__",
  "x-xlb-trace-id": "phase9c-gate-invalid-city",
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
  return response;
}

await expectStatus({
  label: "core order create flow rejects forbidden SKU before persistence",
  method: "POST",
  url: "/api/orders",
  headers: customerHeaders,
  payload: {
    customerId: "phase9c-gate-customer",
    skuId: "demo_cleaning_forbidden_gate",
    quantity: 1,
  },
  expected: [400],
});

await expectStatus({
  label: "core order detail rejects invalid city at runtime",
  method: "GET",
  url: "/api/orders/order_phase9c_gate",
  headers: {
    ...customerHeaders,
    "x-xlb-city-code": "__invalid_city__",
    "x-xlb-trace-id": "phase9c-gate-order-invalid-city",
  },
  expected: [400],
});

await expectStatus({
  label: "dispatch public task route rejects invalid city at runtime",
  method: "GET",
  url: "/api/dispatch/tasks",
  headers: invalidCityOperatorHeaders,
  expected: [400],
});

await expectStatus({
  label: "dispatch run-once rejects non-operator before processor execution",
  method: "POST",
  url: "/api/internal/dispatch/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "ledger accrual route rejects non-operator at runtime",
  method: "GET",
  url: "/api/internal/ledger/accruals",
  headers: customerHeaders,
  expected: [403],
});

await expectStatus({
  label: "ledger run-once route rejects non-operator at runtime",
  method: "POST",
  url: "/api/internal/ledger/run-once",
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
'@ -replace "__APP_URI__", $appUri -replace "__TOKEN_URI__", $tokenUri

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9c-system-behavior-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
  Set-Content -LiteralPath $runtimeFile -Value $runtimeCheck -Encoding UTF8

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runtimeOutput = & $tsxCommand $runtimeFile 2>&1
    $runtimeExit = $LASTEXITCODE
    if ($runtimeExit -ne 0) {
      Add-Failure "Fastify runtime system behavior check failed"
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
  Write-Host "check-phase9c-no-backend-change: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9c-no-backend-change: passed (runtime system behavior validated)"
