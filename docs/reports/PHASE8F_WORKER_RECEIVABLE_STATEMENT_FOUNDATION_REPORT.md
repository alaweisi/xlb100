# Phase 8F Worker Receivable Statement Foundation Report

## Baseline and scope

- Branch: `phase8f-worker-receivable-statement-foundation`
- Baseline main commit: `9a0e7ae05f67068e96fcc3e6cad3f85326078481`
- Phase 8E tag: `xlb-phase8e-settlement-payable-queue` → `9a0e7ae`
- Objective: generate worker-level receivable statement snapshots from queued payables
- Scope: statement tables, internal API, service/repository, outbox, contracts, tests, gate scripts, docs only

**Worker receivable statement is not payout, paid settlement, mock payout, withdrawal, WeChat/Alipay split, payment platform integration, or payment instruction.**

## Implementation

- Migration: `017_worker_receivable_statement.sql`
  - `worker_receivable_statements` — UNIQUE `(queue_id, worker_id)`, status=`created`
  - `worker_receivable_statement_lines` — UNIQUE `(statement_id, settlement_item_id)`
- Service: `workerReceivableStatementService.generateWorkerReceivableStatements`
- API:
  - `POST /api/internal/settlement/payables/:payableId/generate-worker-statements-once`
  - `GET /api/internal/settlement/payables/:payableId/worker-statements`
  - `GET /api/internal/settlement/worker-statements/:statementId`
- Outbox: `worker.receivable.statement.created` (one per worker statement)
- Queue, payable, batch, items, upstream domain state remain unchanged

## Phase 8F verification (2026-07-04)

### Engineering

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | **201 files / 381 passed / 1 todo** |
| preflight | passed (Phase 0–8F) |

### Gate scripts

| Phase | Result |
|-------|--------|
| Phase 8B (6 gates) | 6/6 passed |
| Phase 8C (8 gates) | 8/8 passed |
| Phase 8D (8 gates) | 8/8 passed |
| Phase 8E (8 gates) | 8/8 passed |
| Phase 8F (8 gates) | 8/8 passed |

### Infrastructure

| Check | Result |
|-------|--------|
| Docker MySQL | healthy |
| Docker Redis | healthy |
| migrate-local | passed (017 applied) |
| seed-local | passed |

### Live API chain

```
ledger_accruals → prepare-once → confirm → mark-payable → enqueue-once
→ generate-worker-statements-once
→ worker_receivable_statements + worker_receivable_statement_lines
→ worker.receivable.statement.created outbox
```

| Step | ID / result |
|------|-------------|
| Prepare-once | processed=1 |
| Confirm | status=confirmed |
| Mark-payable | status=payable |
| Enqueue | status=queued |
| Generate 1st | status=created, idempotent=false |
| Generate 2nd | idempotent=true; generatedAt / generatedBy unchanged |
| Statement | `wrs_mr5sbovy_4b20a75c` |
| Line | `wrl_mr5sbow1_18a15e5d` |
| worker.receivable.statement.created | `evt_mr5sbow3_3967d36c` |
| queue status after generate | `queued` |
| payable status after generate | `payable` |
| batch status after generate | `confirmed` |
| Amount snapshot | 89.00 / 8.90 / 80.10 (CNY) |
| Not queued generate | HTTP 404 |
| Cross-city generate / GET | HTTP 404 |
| ledger_entries | 3 per fulfillment (unchanged) |

## Boundary declaration

Phase 8F worker receivable statements do not implement payout, paid settlement, mock payout,
withdrawal, provider splitting, payment instructions, refund, aftersale, reversal,
or UI changes. They do not create ledger entries or mutate upstream domain state.

**Phase 8F body complete — NOT Lock, NOT merge, NOT tag. Phase 8G NOT started.**

## Lock status

| Item | Value |
|------|-------|
| Body complete | yes |
| Merged to main | no |
| Tag | none |
