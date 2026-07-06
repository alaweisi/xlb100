# Phase 14 Production Monitoring Evidence Scaffold

## Decision

- Scaffold status: READY FOR OPERATOR EVIDENCE
- `PROD-OPS-007` Monitoring and alerting: NOT RUN
- `PROD-OPS-008` Payment/refund/reversal duplicate monitoring: NOT RUN
- `PROD-OPS-009` Event handler lag monitoring: NOT RUN
- Production release status: NO-GO / BLOCKED
- Date: 2026-07-06
- Scope: documentation and read-only verification scaffold only.

This document defines the production monitoring evidence that operators must collect before `PROD-OPS-007`, `PROD-OPS-008`, or `PROD-OPS-009` can move to PASS. It does not prove production monitoring is configured, does not deploy production, does not change CI gates, and does not change ledger/replay/audit behavior.

## Required Evidence Artifacts

| PROD-OPS | Required artifact | Required owner | Current status |
| --- | --- | --- | --- |
| `PROD-OPS-007` | `docs/release/evidence/PHASE14_PROD_MONITORING_ALERTING_<timestamp>.md` | SRE / Ops owner | NOT RUN |
| `PROD-OPS-008` | `docs/release/evidence/PHASE14_PROD_DUPLICATE_MONITORING_<timestamp>.md` | SRE / Finance ops owner | NOT RUN |
| `PROD-OPS-009` | `docs/release/evidence/PHASE14_PROD_EVENT_LAG_MONITORING_<timestamp>.md` | SRE / Backend owner | NOT RUN |

Each artifact must include production environment name, commit/image under observation, dashboard or alert links, redacted query outputs, notification test evidence, owner approval, and timestamp. Staging-only evidence is not sufficient.

## Required Dashboards

| Dashboard | Required signals | PASS evidence later |
| --- | --- | --- |
| Production availability | Backend `/health`, DB health, customer URL, worker URL, admin URL, uptime by host. | Dashboard export or screenshot showing all production hostnames and a green baseline. |
| HTTP/API errors | 5xx rate by route group, 4xx anomaly rate, latency percentile by backend route group. | Alert rule export with threshold, route, owner, and tested notification. |
| Event outbox | `event_outbox` pending, published, failed counts by `event_type` and `city_code`; oldest pending age. | Dashboard panel and alert rule covering `refund.approved` pending age. |
| Refund approval | Count of approved refund requests, count of `refund.approved` events, approval-event join gaps. | Query output and panel showing zero join gaps or approved remediation. |
| Ledger reversal | Count and amount of reversal ledger rows by `city_code`, `account_type`, and `direction`. | Query output and panel showing expected directions only. |
| Duplicate financial events | Duplicate `refund.approved` events and duplicate reversal ledger rows. | Alert rule plus zero-row baseline or approved incident record. |
| Replay and immutability | Release-window `npx pnpm preflight` result, replay validator status, immutability validator status. | Pre-cut and post-cut logs attached under release evidence. |
| Audit trace | Missing `conflict_audit` event rows for reversal ledger entries. | Query output showing zero missing audit traces or approved remediation. |

## Required Alerts

| Alert | Trigger | Owner | Escalation |
| --- | --- | --- | --- |
| Production health unavailable | Any production health or app URL fails for 2 consecutive checks. | SRE / Ops owner | Page primary on-call; release owner if during release window. |
| Backend 5xx elevated | Backend 5xx exceeds approved production threshold for 5 minutes. | SRE / Backend owner | Page backend owner; open incident if sustained. |
| `refund.approved` pending lag | Oldest pending `refund.approved` event age exceeds approved threshold. | SRE / Backend owner | Page backend owner; release owner if active cutover. |
| Failed event handler | Any `event_outbox.status = 'failed'` row or unknown status appears. | SRE / Backend owner | Page backend owner; stop release if during production cut. |
| Duplicate refund approval | More than one `refund.approved` outbox event exists for a refund. | SRE / Finance ops owner | Page Finance ops and release owner; freeze refund operations until triaged. |
| Duplicate ledger reversal | More than one reversal ledger row exists for the same city/source/account/direction group. | SRE / Finance ops owner | Page Finance ops and ledger owner; freeze related release action. |
| Reversal direction mismatch | Any reversal row has a direction other than customer `credit`, platform `debit`, worker `debit`. | Ledger owner | Page ledger owner and release owner immediately. |
| Missing audit trace | Any reversal ledger row lacks a `conflict_audit` outbox trace. | Ledger owner | Page ledger owner; run replay/immutability checks before continuing. |
| Replay/immutability failure | `npx pnpm preflight` fails replay or immutability checks. | Release owner / Ledger owner | Abort production release or rollback decision path. |

## Required Log Queries

Operators must provide log-query links or exported evidence from the production log platform for these watches:

| Watch | Required query intent | PASS evidence later |
| --- | --- | --- |
| Failed event handler watch | Search backend production logs for `LedgerReversalError`, failed outbox handling, and `event_outbox` mark-failed paths. | Query link/export shows zero untriaged production failures for the release window or documented incidents with owner approval. |
| Ledger replay failure watch | Search release and CI logs for replay validator failures and `check-ledger-replay` output. | Pre-cut and post-cut logs show replay passed for the intended commit. |
| Immutability failure watch | Search release and CI logs for immutability validator failures and `check-ledger-immutability` output. | Pre-cut and post-cut logs show immutability passed for the intended commit. |
| Audit trace watch | Search backend logs for audit write failures, `conflict_audit`, and stable hash mismatch messages. | Query link/export shows no untriaged audit trace gaps. |
| Refund approval watch | Search backend logs for refund approval route errors and duplicate approval attempts. | Query link/export shows no untriaged duplicate approval attempts or failed approvals. |

## Required Read-Only DB Verification Queries

These queries are read-only and may be run against production only by an authorized operator, preferably against a production read replica. They must not be run by Codex unless a real production env file and operator approval are provided.

### Duplicate Refund Approval Watch

Expected result: zero rows.

```sql
SELECT city_code, aggregate_id AS refund_id, COUNT(*) AS event_count
  FROM event_outbox
 WHERE event_type = 'refund.approved'
 GROUP BY city_code, aggregate_id
HAVING COUNT(*) > 1;
```

Expected result: zero rows.

```sql
SELECT r.city_code, r.refund_id, r.status, r.approval_event_id,
       eo.event_id, eo.event_type, eo.aggregate_type, eo.aggregate_id, eo.status AS event_status
  FROM aftersale_refund_requests r
  LEFT JOIN event_outbox eo
    ON eo.city_code = r.city_code
   AND eo.event_id = r.approval_event_id
 WHERE r.status = 'approved'
   AND (
        r.approval_event_id IS NULL
        OR eo.event_id IS NULL
        OR eo.event_type <> 'refund.approved'
        OR eo.aggregate_type <> 'refund'
        OR eo.aggregate_id <> r.refund_id
   );
```

### Duplicate Ledger Reversal Watch

Expected result: zero rows. `ledger_entries.source_id` is the fulfillment id for Phase 14 refund reversals.

```sql
SELECT city_code, source_type, source_id, account_type, direction, COUNT(*) AS entry_count
  FROM ledger_entries
 WHERE source_type = 'refund.approved'
 GROUP BY city_code, source_type, source_id, account_type, direction
HAVING COUNT(*) > 1;
```

Expected result: zero rows.

```sql
SELECT entry_id, city_code, source_id, account_type, direction, amount, currency, created_at
  FROM ledger_entries
 WHERE source_type = 'refund.approved'
   AND NOT (
        (account_type = 'customer' AND direction = 'credit')
        OR (account_type = 'platform' AND direction = 'debit')
        OR (account_type = 'worker' AND direction = 'debit')
   );
```

### `refund.approved` Event Outbox Lag Watch

Expected result: row count and oldest age are below the production threshold approved by SRE and Backend owners.

```sql
SELECT city_code,
       COUNT(*) AS pending_count,
       MIN(created_at) AS oldest_created_at,
       TIMESTAMPDIFF(MINUTE, MIN(created_at), UTC_TIMESTAMP()) AS oldest_pending_minutes
  FROM event_outbox
 WHERE event_type = 'refund.approved'
   AND status = 'pending'
 GROUP BY city_code;
```

### Failed Event Handler Watch

Expected result: zero rows.

```sql
SELECT city_code, event_type, status, COUNT(*) AS event_count, MIN(created_at) AS oldest_created_at
  FROM event_outbox
 WHERE status = 'failed'
    OR (event_type = 'refund.approved' AND status NOT IN ('pending', 'published', 'failed'))
 GROUP BY city_code, event_type, status;
```

### Audit Trace Watch

Expected result: zero rows.

```sql
SELECT le.city_code, le.source_id, le.entry_id, le.account_type, le.direction
  FROM ledger_entries le
  LEFT JOIN event_outbox eo
    ON eo.city_code = le.city_code
   AND eo.event_type = 'conflict_audit'
   AND eo.aggregate_type = 'ledger_entry'
   AND eo.aggregate_id = le.entry_id
 WHERE le.source_type = 'refund.approved'
   AND eo.event_id IS NULL;
```

## Operator Helper

The repository includes a read-only helper scaffold:

```powershell
deploy\production\check-prod-monitoring.ps1 -EnvFile .env.production -DryRun
```

The helper refuses `.env.production.example`, requires an explicit env file, prints the checks in dry-run mode, and only runs hardcoded read-only queries when `-RunDbChecks` is provided by an operator with a real production env file.

## Escalation Rule

Any financial duplicate, reversal direction mismatch, missing audit trace, failed event handler, or replay/immutability failure during the release window is a release-stop event. The operator must notify SRE, Finance ops, Backend, Ledger, and Release owners, attach evidence, and keep production release as NO-GO unless the release owner records an explicit accepted-risk decision.

## Exact PASS Evidence Required Later

### `PROD-OPS-007` Monitoring and Alerting

PASS requires:

- Production dashboard export or links covering availability, 5xx, event outbox, refund approval, reversal, replay, immutability, and audit trace health.
- Alert rule export with thresholds, owners, and notification routes.
- Notification test evidence from the production alerting route.
- SRE / Ops owner approval.

FAIL criteria: missing dashboard, missing alert owner, staging-only monitoring, untested notification route, or untriaged production alert.

### `PROD-OPS-008` Payment/Refund/Reversal Duplicate Monitoring

PASS requires:

- Production or production-read-replica output for duplicate refund approval and duplicate reversal queries.
- Alert or scheduled watch proving duplicate rows would notify SRE and Finance ops.
- Zero-row baseline, or documented incident/remediation accepted by SRE, Finance ops, Ledger, and Release owners.
- Finance ops owner approval.

FAIL criteria: no production query output, duplicate rows without accepted remediation, no Finance escalation route, or UAT-only evidence.

### `PROD-OPS-009` Event Handler Lag Monitoring

PASS requires:

- Production or production-read-replica output for `refund.approved` pending age.
- Alert rule for oldest pending age and/or pending count with threshold, owner, and notification route.
- Notification test evidence.
- SRE / Backend owner approval.

FAIL criteria: no production lag query, no alert threshold, missing owner, untested notification, or pending events exceeding the threshold without accepted remediation.

## Current Conclusion

`PROD-OPS-007`, `PROD-OPS-008`, and `PROD-OPS-009` remain NOT RUN. The evidence scaffold is ready for operators, but real production monitoring evidence is still required before production can move toward GO.
