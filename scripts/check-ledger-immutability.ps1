$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendRoot = Join-Path $Root "backend"
$RepoRoot = ($Root -replace "\\", "/")
$Marker = "XLB_LEDGER_IMMUTABILITY_RESULT "
$RunnerPath = Join-Path $env:TEMP "xlb-ledger-immutability-$([Guid]::NewGuid().ToString('N')).mts"

$runner = @'
import { pathToFileURL } from "node:url";

const repoRoot = process.env.XLB_REPLAY_REPO_ROOT;
const backendRoot = process.env.XLB_REPLAY_BACKEND_ROOT;
if (!repoRoot || !backendRoot) {
  throw new Error("XLB_REPLAY_REPO_ROOT and XLB_REPLAY_BACKEND_ROOT are required");
}

const [
  { SEEDED_CITY_CODES },
  { getMysqlPool, closeMysqlPool },
  { ledgerReplayValidator },
  { toEventOutboxAuditPayload },
  { stableHash },
] = await Promise.all([
  import("@xlb/config"),
  import(pathToFileURL(`${backendRoot}/src/dal/mysqlPool.ts`).href),
  import(pathToFileURL(`${backendRoot}/src/ledger/replay/replayValidator.ts`).href),
  import(pathToFileURL(`${backendRoot}/src/ledger/auditGate.ts`).href),
  import(pathToFileURL(`${repoRoot}/packages/shared/deterministic/stableHash.ts`).href),
]);

const pool = getMysqlPool();
const results = [];

function buildContext(cityCode) {
  return {
    traceId: `ci-ledger-immutability-${cityCode}`,
    appType: "admin",
    role: "auditor",
    cityCode,
    userId: "ci-preflight",
    requestStartedAt: new Date().toISOString(),
  };
}

function resolveFeeType(row) {
  if (row.source_type === "refund.approved") {
    if (row.account_type === "customer" && row.direction === "credit") {
      return "gross";
    }
    if (row.account_type === "platform" && row.direction === "debit") {
      return "platform_fee";
    }
    if (row.account_type === "worker" && row.direction === "debit") {
      return "worker_receivable";
    }
    return null;
  }
  if (row.account_type === "customer" && row.direction === "debit") {
    return "gross";
  }
  if (row.account_type === "platform" && row.direction === "credit") {
    return "platform_fee";
  }
  if (row.account_type === "worker" && row.direction === "credit") {
    return "worker_receivable";
  }
  return null;
}

function parsePayload(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  return value ?? {};
}

function summarizeReplayDiff(replay) {
  if (replay.match) {
    return [];
  }
  return replay.diff.map((diff) => ({
    kind: "replay_mismatch",
    entry_id: diff.entry_id,
    reason: diff.kind,
    detail: diff,
  }));
}

function isSnapshotHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function loadLedgerEntryAuditRows(cityCode) {
  const [rows] = await pool.query(
    `SELECT le.entry_id, le.city_code, le.source_type, le.source_id,
            le.direction, le.account_type, le.amount, le.currency,
            la.order_id,
            eo.event_id AS audit_event_id,
            eo.payload_json AS audit_payload_json
       FROM ledger_entries le
       LEFT JOIN ledger_accruals la
         ON la.city_code = le.city_code
        AND la.fulfillment_id = le.source_id
       LEFT JOIN event_outbox eo
         ON eo.city_code = le.city_code
        AND eo.event_type = 'conflict_audit'
        AND eo.aggregate_type = 'ledger_entry'
        AND eo.aggregate_id = le.entry_id
      WHERE le.city_code = ?
      ORDER BY le.created_at ASC, le.entry_id ASC, eo.created_at ASC, eo.event_id ASC`,
    [cityCode],
  );

  const entries = new Map();
  for (const row of rows) {
    let entry = entries.get(row.entry_id);
    if (!entry) {
      entry = {
        row,
        audits: [],
      };
      entries.set(row.entry_id, entry);
    }
    if (row.audit_event_id) {
      entry.audits.push({
        event_id: row.audit_event_id,
        payload: parsePayload(row.audit_payload_json),
      });
    }
  }

  return [...entries.values()];
}

function validateEntryAudit(entry) {
  const row = entry.row;
  const violations = [];
  const feeType = resolveFeeType(row);
  const orderId = row.order_id;

  if (!orderId) {
    violations.push({
      kind: "orphan_ledger_entry",
      entry_id: row.entry_id,
      reason: "ledger entry has no matching ledger_accrual order_id",
    });
  }

  if (!feeType) {
    violations.push({
      kind: "missing_snapshot_hash",
      entry_id: row.entry_id,
      reason: "ledger entry cannot be reduced to an audit fee_type",
    });
  }

  if (entry.audits.length === 0) {
    violations.push({
      kind: "missing_audit_record",
      entry_id: row.entry_id,
      reason: "no conflict_audit event_outbox record for ledger entry",
    });
    return violations;
  }

  const expectedSnapshotHash =
    feeType && orderId
      ? stableHash({
          city_code: row.city_code,
          order_id: orderId,
          fee_type: feeType,
          source_type: row.source_type,
          source_id: row.source_id,
          amount: Number(row.amount),
          currency: row.currency,
        })
      : null;

  if (!expectedSnapshotHash) {
    violations.push({
      kind: "missing_snapshot_hash",
      entry_id: row.entry_id,
      reason: "persisted ledger entry cannot produce a deterministic snapshot_hash",
    });
    return violations;
  }

  const expectedPayload = toEventOutboxAuditPayload({
    order_id: orderId,
    fee_type: feeType,
    source_type: row.source_type,
    snapshot_hash: expectedSnapshotHash,
    created_at: "",
  });

  for (const audit of entry.audits) {
    const payload = audit.payload;
    if (!isSnapshotHash(payload.snapshot_hash)) {
      violations.push({
        kind: "missing_snapshot_hash",
        entry_id: row.entry_id,
        audit_event_id: audit.event_id,
        reason: "audit payload missing stableHash-compliant snapshot_hash",
      });
      continue;
    }

    for (const key of ["order_id", "fee_type", "source_type", "snapshot_hash"]) {
      if (payload[key] !== expectedPayload[key]) {
        violations.push({
          kind: key === "snapshot_hash" ? "snapshot_hash_mismatch" : "audit_gate_mismatch",
          entry_id: row.entry_id,
          audit_event_id: audit.event_id,
          reason: `audit payload ${key} does not match auditGate snapshot`,
          expected: expectedPayload[key],
          actual: payload[key],
        });
      }
    }
  }

  return violations;
}

async function loadLedgerAccrualAuditRows(cityCode) {
  const [rows] = await pool.query(
    `SELECT la.accrual_id, la.city_code, la.fulfillment_id, la.order_id,
            la.payment_order_id, la.worker_id, la.customer_id, la.sku_id,
            la.gross_amount, la.platform_fee, la.worker_receivable, la.currency,
            la.source_event_id, la.status,
            eo.event_id AS audit_event_id,
            eo.payload_json AS audit_payload_json
       FROM ledger_accruals la
       LEFT JOIN event_outbox eo
         ON eo.city_code = la.city_code
        AND eo.event_type = 'conflict_audit'
        AND eo.aggregate_type = 'ledger_accrual'
        AND eo.aggregate_id = la.accrual_id
      WHERE la.city_code = ?
      ORDER BY la.created_at ASC, la.accrual_id ASC, eo.created_at ASC, eo.event_id ASC`,
    [cityCode],
  );

  const accruals = new Map();
  for (const row of rows) {
    let accrual = accruals.get(row.accrual_id);
    if (!accrual) {
      accrual = {
        row,
        audits: [],
      };
      accruals.set(row.accrual_id, accrual);
    }
    if (row.audit_event_id) {
      accrual.audits.push({
        event_id: row.audit_event_id,
        payload: parsePayload(row.audit_payload_json),
      });
    }
  }

  return [...accruals.values()];
}

function validateAccrualAudit(accrual) {
  const row = accrual.row;
  const violations = [];
  const expectedAudits = [
    ["gross", Number(row.gross_amount)],
    ["platform_fee", Number(row.platform_fee)],
    ["worker_receivable", Number(row.worker_receivable)],
  ].map(([feeType, amount]) => ({
    fee_type: feeType,
    payload: toEventOutboxAuditPayload({
      order_id: row.order_id,
      fee_type: feeType,
      source_type: "ledger.accrued",
      snapshot_hash: stableHash({
        city_code: row.city_code,
        order_id: row.order_id,
        fee_type: feeType,
        source_type: "ledger.accrued",
        accrual_id: row.accrual_id,
        fulfillment_id: row.fulfillment_id,
        amount,
        currency: row.currency,
      }),
      created_at: "",
    }),
  }));

  if (!row.source_event_id || !row.order_id || !row.fulfillment_id) {
    violations.push({
      kind: "orphan_ledger_entry",
      accrual_id: row.accrual_id,
      reason: "ledger accrual is missing source_event_id, order_id, or fulfillment_id",
    });
  }

  for (const expected of expectedAudits) {
    const matchingAudits = accrual.audits.filter(
      (audit) => audit.payload.fee_type === expected.fee_type,
    );
    if (matchingAudits.length === 0) {
      violations.push({
        kind: "missing_audit_record",
        accrual_id: row.accrual_id,
        fee_type: expected.fee_type,
        reason: "no fee-specific conflict_audit event_outbox record for ledger accrual",
      });
      continue;
    }

    for (const audit of matchingAudits) {
      const payload = audit.payload;
      if (!isSnapshotHash(payload.snapshot_hash)) {
        violations.push({
          kind: "missing_snapshot_hash",
          accrual_id: row.accrual_id,
          audit_event_id: audit.event_id,
          fee_type: expected.fee_type,
          reason: "accrual audit payload missing stableHash-compliant snapshot_hash",
        });
        continue;
      }

      for (const key of ["order_id", "fee_type", "source_type", "snapshot_hash"]) {
        if (payload[key] !== expected.payload[key]) {
          violations.push({
            kind: key === "snapshot_hash" ? "snapshot_hash_mismatch" : "audit_gate_mismatch",
            accrual_id: row.accrual_id,
            audit_event_id: audit.event_id,
            fee_type: expected.fee_type,
            reason: `accrual audit payload ${key} does not match auditGate snapshot`,
            expected: expected.payload[key],
            actual: payload[key],
          });
        }
      }
    }
  }

  return violations;
}

try {
  for (const cityCode of SEEDED_CITY_CODES) {
    const replay = await ledgerReplayValidator.validate(buildContext(cityCode));
    const entries = await loadLedgerEntryAuditRows(cityCode);
    const accruals = await loadLedgerAccrualAuditRows(cityCode);
    const auditViolations = [
      ...entries.flatMap(validateEntryAudit),
      ...accruals.flatMap(validateAccrualAudit),
    ];
    const replayViolations = summarizeReplayDiff(replay);
    const violations = [...replayViolations, ...auditViolations];

    results.push({
      cityCode,
      replayMatch: replay.match,
      ledgerEntryCount: entries.length,
      ledgerAccrualCount: accruals.length,
      violationCount: violations.length,
      violations,
    });
  }

  console.log(
    "XLB_LEDGER_IMMUTABILITY_RESULT " +
      JSON.stringify({
        ok: results.every((result) => result.violationCount === 0),
        results,
      }),
  );
} catch (error) {
  console.error(
    "XLB_LEDGER_IMMUTABILITY_ERROR " +
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
      }),
  );
  process.exitCode = 1;
} finally {
  await closeMysqlPool();
}
'@

Write-Host "check-ledger-immutability: running replay and audit proof checks"

[System.IO.File]::WriteAllText($RunnerPath, $runner, [System.Text.UTF8Encoding]::new($false))

Push-Location $BackendRoot
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $env:XLB_REPLAY_REPO_ROOT = $RepoRoot
  $env:XLB_REPLAY_BACKEND_ROOT = ($BackendRoot -replace "\\", "/")
  $output = & pnpm exec tsx --tsconfig=tsconfig.json $RunnerPath 2>&1
  $nodeExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
} finally {
  if ($previousErrorActionPreference) {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Remove-Item -LiteralPath $RunnerPath -Force -ErrorAction SilentlyContinue
  Pop-Location
}

if ($nodeExitCode -ne 0) {
  $output | ForEach-Object { Write-Host $_ }
  Write-Host "check-ledger-immutability: FAILED - immutability proof execution failed"
  exit 1
}

$output |
  Where-Object { -not "$_".StartsWith($Marker) } |
  ForEach-Object { Write-Host $_ }

$resultLine = @($output | Where-Object { "$_".StartsWith($Marker) } | Select-Object -Last 1)
if ($resultLine.Count -eq 0) {
  Write-Host "check-ledger-immutability: FAILED - immutability proof did not emit a result"
  exit 1
}

$payload = ($resultLine[0].Substring($Marker.Length) | ConvertFrom-Json)
$failed = @($payload.results | Where-Object { $_.violationCount -gt 0 })

if ($failed.Count -gt 0) {
  Write-Host "check-ledger-immutability: FAILED - ledger immutability proof violation detected"
  foreach ($city in $failed) {
    $violations = @($city.violations)
    Write-Host "  city_code: $($city.cityCode), replay_match: $($city.replayMatch), ledger_entries: $($city.ledgerEntryCount), ledger_accruals: $($city.ledgerAccrualCount), violation_count: $($violations.Count)"
    $violations |
      Group-Object kind |
      Sort-Object Name |
      ForEach-Object { Write-Host "  $($_.Name): $($_.Count)" }
    $violations |
      Select-Object -First 20 |
      ConvertTo-Json -Depth 10 |
      ForEach-Object { Write-Host "  $_" }
    if ($violations.Count -gt 20) {
      Write-Host "  ... $($violations.Count - 20) more violation(s) omitted"
    }
  }
  exit 1
}

Write-Host "check-ledger-immutability: passed"
