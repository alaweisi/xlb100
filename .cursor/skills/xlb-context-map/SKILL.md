---
name: xlb-context-map
description: >-
  Navigation index for the XLB monorepo. Selects a small set of control-plane
  and current-worktree files without confusing the canonical root with a
  managed Work Unit. Use when locating domain code, contracts, tests,
  migrations, phase evidence, or governance records.
---

# XLB Context Map

**Goal:** Read 3-5 relevant files, from the correct root, rather than searching
the whole monorepo.

## Resolve roots first

Run `xlb-session-sync` first and retain:

- `$CanonicalRoot = 'G:\xlb100'`
- `$CurrentRoot = git rev-parse --show-toplevel`
- the verified current/canonical Git common-directory identity

Use the canonical root for control-plane facts. Use the current worktree for
the source tree, tests, branch-local reports, and candidate diff. Never force a
managed Work Unit to `cd` to the canonical root to inspect its implementation.

## Global entry points

| Need | Root | Read |
|------|------|------|
| Current Phase / Lock / tag facts | canonical | `docs/CURRENT_STATE.md` |
| Highest governance and Agent rules | canonical | `AGENTS.md`, `governance/01_PROJECT_CONSTITUTION_DRAFT.md`, `governance/04_ADR_DECISION_ENGINE_DESIGN.md`, `governance/06_PARALLEL_CONSTRUCTION_GOVERNANCE_DESIGN.md` |
| Train / Work Unit authority | canonical | `governance/execution/` registry, Charter, Manifest, leases, reservations, queue |
| Architecture law | current worktree | `docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md` |
| Branch-local source/contracts/tests | current worktree | touched module, `docs/contracts/`, `tests/` |
| DB dictionaries and migrations in candidate | current worktree | `db/dictionary/`, `db/migrations/` |
| Gate implementation for the candidate | current worktree | `scripts/check-*.ps1`, `scripts/preflight-architecture.ps1` |

If a branch-local governance or `CURRENT_STATE` copy differs from canonical
control facts, stop and report the conflict. A Work Unit may not mutate those
protected serial paths.

## Do NOT read for context

- `backend/dist/`, `apps/*/dist/`
- `node_modules/`, `.turbo/`
- `packages/types/src/*.js` (misbuild artifacts)
- Old SDJ99 blueprint files outside the repository
- The same source path in `G:\xlb100` as a substitute for the current Work Unit

## Domain quick map (relative to `$CurrentRoot`)

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

When the authorized scope changes a domain, inspect in this order from
`$CurrentRoot`:

1. `packages/types/src/<domain>.ts`
2. `packages/validators/src/<domain>Schema.ts`
3. `backend/src/<module>/`
4. `packages/api-client/src/<app>.ts`
5. `db/migrations/` (new file only; reservation required; never edit locked migrations)
6. `tests/` unit -> integration -> contract -> security

This is an inspection/edit ordering, not authority. The Manifest path and
semantic leases must cover every actual write. Never copy types into
`apps/*/src`.

## Event / outbox map

| event_type | Producer | Consumer |
|------------|----------|----------|
| `order.paid` | payment | dispatch |
| `dispatch.accepted` | worker accept | downstream fulfillment |
| `fulfillment.completed` | fulfillment complete | ledger |
| `settlement.prepared` | settlement preparation | later settlement flow |
| `settlement.confirmed` | settlement confirmation | downstream audit/projection |

Confirm the current implementation and allowed Phase in the current worktree;
the table is navigation, not permission.

## Search strategy

1. Classify each needed fact as canonical control or current-worktree source.
2. Check this map and read the listed 3-5 files.
3. Use `rg` in one current-worktree module directory.
4. Read the module `README.md`.
5. Broaden search only when evidence is still missing.

Full module tree: [reference.md](reference.md)

## Related skills

- `xlb-session-sync` - root and state resolution; run first
- `xlb-managed-worktree` - canonical Manifest and boundary enforcement
- `xlb-phase-boundary` - allowed and forbidden scope
- `xlb-current-vs-target` - blueprint versus current implementation
