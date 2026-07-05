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

if ($failures.Count -eq 0) {
  $appUri = ([System.Uri]$appFile).AbsoluteUri
  $runtimeCheck = @'
const { buildApp } = await import("__APP_URI__");

const app = await buildApp();

const customerHeaders = {
  "x-xlb-app-type": "customer",
  "x-xlb-role": "customer",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9d-gate-customer",
  "x-xlb-trace-id": "phase9d-gate-customer",
};

const operatorHeaders = {
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": "hangzhou",
  "x-xlb-user-id": "phase9d-gate-operator",
  "x-xlb-trace-id": "phase9d-gate-operator",
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

async function expectOkJson({ label, url }) {
  const response = await expectStatus({
    label,
    method: "GET",
    url,
    headers: operatorHeaders,
    expected: [200],
  });

  try {
    const body = JSON.parse(response.body);
    if (body?.ok !== true) {
      failures.push(`${label}: expected JSON body with ok=true`);
    }
  } catch {
    failures.push(`${label}: response was not valid JSON`);
  }
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

await expectOkJson({
  label: "dispatch task route returns read model",
  url: "/api/dispatch/tasks",
});

await expectStatus({
  label: "dispatch run-once rejects non-operator before processor execution",
  method: "POST",
  url: "/api/internal/dispatch/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectOkJson({
  label: "ledger accrual endpoint returns read model",
  url: "/api/internal/ledger/accruals",
});

await expectStatus({
  label: "ledger run-once rejects non-operator before mutation path",
  method: "POST",
  url: "/api/internal/ledger/run-once",
  headers: customerHeaders,
  expected: [403],
});

await expectOkJson({
  label: "UI statement audit API returns valid response",
  url: "/api/internal/settlement/worker-statement-audit?limit=1",
});

await expectOkJson({
  label: "UI export audit API returns valid response",
  url: "/api/internal/settlement/worker-statement-export-audit?limit=1",
});

await expectOkJson({
  label: "UI review summary API returns valid response",
  url: "/api/internal/settlement/worker-statement-review-summary",
});

await expectOkJson({
  label: "UI settlement audit summary API returns valid response",
  url: "/api/internal/settlement/settlement-audit-summary",
});

await expectOkJson({
  label: "UI reconciliation gap scan API returns valid response",
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
'@ -replace "__APP_URI__", $appUri

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
