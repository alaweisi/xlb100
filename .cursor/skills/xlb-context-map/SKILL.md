---
name: xlb-context-map
description: >-
  Navigation index for XLB/喜乐帮 monorepo — which files to read for each domain
  without searching the whole repo. Use when locating order, payment, dispatch,
  worker accept, fulfillment, ledger, settlement code, contracts, tests, or
  migrations; or when context window is limited.
---

# XLB Context Map

**Goal:** Read 3–5 files, not the whole monorepo.

## Global entry points (always safe)

| Need | Read |
|------|------|
| Current phase / tags | `docs/CURRENT_STATE.md` |
| Agent rules | `AGENTS.md`, `.cursor/rules/xlb-architecture-mandatory.mdc` |
| Architecture law | `docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md` |
| DB tables | `db/dictionary/TABLES.md`, `CITY_CODE_COLUMNS.md` |
| Preflight gates | `scripts/preflight-architecture.ps1` |

## Do NOT read for context

- `backend/dist/`, `apps/*/dist/`
- `node_modules/`, `.turbo/`
- `packages/types/src/*.js` (misbuild artifacts)
- Old SDJ99 blueprint txt from Downloads

## Domain quick map

| Domain | Service | Routes | Contract | Integration test |
|--------|---------|--------|----------|------------------|
| RequestContext | `backend/src/context/` | middleware | `CONTRACT_REQUEST_CONTEXT.md` | `requestContext.test.ts` |
| Order | `order/orderService.ts` | `orderRoutes.ts` | `CONTRACT_ORDER.md` | `orderCreate.test.ts` |
| Payment | `payment/paymentOrderService.ts` | `paymentModule.ts` | `CONTRACT_PAYMENT.md` | `mockPaymentWebhook.test.ts` |
| Dispatch | `dispatch/dispatchService.ts` | internal run-once | `CONTRACT_DISPATCH_*.md` | `dispatchRunOnce.test.ts` |
| Worker pool | `worker/taskPoolService.ts` | `taskPoolRoutes.ts` | `CONTRACT_WORKER_TASK_POOL.md` | `workerTaskPoolApi.test.ts` |
| Eligibility | `compliance/certMatcher/workerDispatchEligibility.ts` | worker routes | `CONTRACT_WORKER_ELIGIBILITY.md` | `workerEligibilityApi.test.ts` |
| Accept | `worker/workerAcceptService.ts` | `workerAcceptRoutes.ts` | `CONTRACT_WORKER_ACCEPT.md` | `workerAcceptApi.test.ts` |
| Fulfillment | `fulfillment/fulfillmentService.ts` | `fulfillmentRoutes.ts` | `CONTRACT_FULFILLMENT_*.md` | `fulfillmentCompleteApi.test.ts` |
| Ledger | `ledger/ledgerAccrualService.ts` | `ledgerRoutes.ts` | `CONTRACT_LEDGER_*.md` | `ledgerRunOnce.test.ts` |
| Settlement | `settlement/settlementPreparationService.ts` | `settlementRoutes.ts` | `CONTRACT_SETTLEMENT_*.md` | settlement integration tests |

## Contract-first edit order

When changing a domain:

1. `packages/types/src/<domain>.ts`
2. `packages/validators/src/<domain>Schema.ts`
3. `backend/src/<module>/`
4. `packages/api-client/src/<app>.ts`
5. `db/migrations/` (new file only — never edit locked migrations)
6. `tests/` unit → integration → contract → security

**Never** copy types into `apps/*/src`.

## Event / outbox map

| event_type | Producer | Consumer (phase) |
|------------|----------|------------------|
| order.paid | payment | dispatch (5A) |
| dispatch.accepted | worker accept | — |
| fulfillment.completed | fulfillment complete | **ledger (8A)** |
| settlement.prepared | settlement prep (8B) | — |
| settlement.confirmed | settlement confirm (8C) | — |

Consumer code: `backend/src/ledger/ledgerOutboxConsumer.ts`, settlement services.

## Phase docs map

| Phase | Report | Architecture |
|-------|--------|--------------|
| 7A accept | `PHASE7A_WORKER_ACCEPT_*` | `10_XLB_WORKER_ACCEPT_*` |
| 7B lifecycle | `PHASE7B_FULFILLMENT_*` | `11_XLB_FULFILLMENT_*` |
| 8A ledger | `PHASE8A_LEDGER_*` | `12_XLB_LEDGER_*` |
| 8B settlement prep | `PHASE8B_SETTLEMENT_*` | `13_XLB_SETTLEMENT_*` |
| 8C settlement confirm | `PHASE8C_SETTLEMENT_*` | `14_XLB_SETTLEMENT_*` |

Full module tree: [reference.md](reference.md)

## Search strategy

1. Check this map → read listed files
2. `rg` in **one** module dir, not whole repo
3. Read module `README.md`
4. Only then broaden search

## Related skills

- `xlb-session-sync` — run first
- `xlb-phase-boundary` — what's allowed now
- `xlb-current-vs-target` — blueprint vs repo
