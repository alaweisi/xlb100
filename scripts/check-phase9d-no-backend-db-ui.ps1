# Phase 9D gate: validate runtime system and UI API behavior, not file immutability.
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
if ($failures.Count -eq 0) {
  $appUri = ([System.Uri]::new($appFile, [System.UriKind]::Absolute)).AbsoluteUri
  $tokenUri = ([System.Uri]::new($tokenFile, [System.UriKind]::Absolute)).AbsoluteUri
  $runtimeCheck = @'
const { buildApp } = await import("__APP_URI__");
const { createToken } = await import("__TOKEN_URI__");

const app = await buildApp();

const customerHeaders = {
  authorization: `Bearer ${createToken("phase9d-gate-customer", "customer", "customer")}`,
  "x-xlb-city-code": "hangzhou",
  "x-xlb-trace-id": "phase9d-gate-customer",
};

const operatorHeaders = {
  authorization: `Bearer ${createToken("phase9d-gate-operator", "operator", "admin")}`,
  "x-xlb-city-code": "hangzhou",
  "x-xlb-trace-id": "phase9d-gate-operator",
};

const operatorHeadersWithoutCity = {
  authorization: operatorHeaders.authorization,
  "x-xlb-trace-id": "phase9d-gate-missing-city",
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

async function expectCityScopedRoute({ label, url }) {
  await expectStatus({
    label,
    method: "GET",
    url,
    headers: operatorHeadersWithoutCity,
    expected: [400],
  });
}

await expectStatus({
  label: "order create flow reaches domain validation without persistence",
  method: "POST",
  url: "/api/orders",
  headers: customerHeaders,
  payload: {
    customerId: "phase9d-gate-customer",
    skuId: "demo_cleaning_forbidden_gate",
    quantity: 1,
  },
  expected: [400],
});

await expectStatus({
  label: "order detail route handles invalid city at runtime",
  method: "GET",
  url: "/api/orders/order_phase9d_gate",
  headers: {
    ...customerHeaders,
    "x-xlb-city-code": "__invalid_city__",
    "x-xlb-trace-id": "phase9d-gate-order-invalid-city",
  },
  expected: [400],
});

await expectCityScopedRoute({
  label: "dispatch task route enforces city scope before database access",
  url: "/api/dispatch/tasks",
});

await expectStatus({
  label: "dispatch run-once rejects non-operator before processor execution",
  method: "POST",
  url: "/api/internal/dispatch/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectCityScopedRoute({
  label: "ledger accrual route enforces city scope before database access",
  url: "/api/internal/ledger/accruals",
});

await expectStatus({
  label: "ledger run-once rejects non-operator before mutation path",
  method: "POST",
  url: "/api/internal/ledger/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectCityScopedRoute({
  label: "UI statement audit route enforces city scope before database access",
  url: "/api/internal/settlement/worker-statement-audit?limit=1",
});

await expectCityScopedRoute({
  label: "UI export audit route enforces city scope before database access",
  url: "/api/internal/settlement/worker-statement-export-audit?limit=1",
});

await expectCityScopedRoute({
  label: "UI review summary route enforces city scope before database access",
  url: "/api/internal/settlement/worker-statement-review-summary",
});

await expectCityScopedRoute({
  label: "UI settlement audit summary route enforces city scope before database access",
  url: "/api/internal/settlement/settlement-audit-summary",
});

await expectCityScopedRoute({
  label: "UI reconciliation gap scan route enforces city scope before database access",
  url: "/api/internal/settlement/reconciliation-gap-scan",
});

await app.close();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

process.exit(0);
'@ -replace "__APP_URI__", $appUri -replace "__TOKEN_URI__", $tokenUri

  $runtimeFile = Join-Path ([System.IO.Path]::GetTempPath()) ("xlb-phase9d-runtime-behavior-" + [System.Guid]::NewGuid().ToString("N") + ".mts")
  Set-Content -LiteralPath $runtimeFile -Value $runtimeCheck -Encoding UTF8

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $runtimeOutput = & pnpm --filter "@xlb/backend" exec tsx $runtimeFile 2>&1
    $runtimeExit = $LASTEXITCODE
    if ($runtimeExit -ne 0) {
      Add-Failure "Fastify runtime system/UI behavior check failed"
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
  Write-Host "check-phase9d-no-backend-db-ui: FAILED"
  $failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase9d-no-backend-db-ui: passed (runtime system and UI API behavior validated)"
