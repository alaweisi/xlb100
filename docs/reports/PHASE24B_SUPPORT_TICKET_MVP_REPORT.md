# Phase 24B — Support Ticket MVP Report

## Status

- Branch: `codex/phase24b-support-ticket-mvp`
- Base: `main` at `04f1c43`, carrying the approved Phase 24A design documents
- Status: **IMPLEMENTATION COMPLETE — AWAITING HUMAN ACCEPTANCE — NOT LOCKED**
- Migration: `047_phase24b_support_ticket_mvp.sql`
- Phase 17 relationship: incremental intake only; Aftersale remains the business source of truth

## Scope

Phase 24B establishes the first runnable slice of the independent XLB customer-support domain:

- city-scoped support tickets and append-only ticket events;
- Customer/Worker authenticated intake, own-list, detail, comment, and reopen;
- Admin/Operator queue, detail, assignment, comments, escalation, resolution, and closure;
- ownership, role, city, idempotency, optimistic concurrency, and Outbox guarantees;
- three-app API-backed support pages;
- migration replay, contract, unit, component, integration, security, E2E, and CI gates.

## Boundary

- Support owns the customer-service ticket status, assignment, and communication record.
- Phase 17 owns complaint, repair, liability, compensation, refund, and order-reverse semantics.
- A linked complaint is a validated same-city read-only relation; Support never writes an `aftersale_*` table.
- Phase 24B does not implement routing/SLA automation, WebSocket/IM, bot/NLU, knowledge base, CSAT, quality review, payment execution, dispatch mutation, worker-finance approval, ledger, settlement, payout, or real Providers.
- Migrations `000`–`046` and all locked tags remain immutable.

## Delivered artifacts

### Contract and client

- `packages/types/src/support.ts`
- `packages/validators/src/supportSchema.ts`
- `packages/api-client/src/support.ts`
- `docs/contracts/CONTRACT_SUPPORT_TICKETS.md`
- closed internal Outbox event names under `support.ticket.*`

### Persistence and backend

- `db/migrations/047_phase24b_support_ticket_mvp.sql`
- `backend/src/support/supportModule.ts`
- `backend/src/support/ticket/`
- registration in `backend/src/app.ts`

### Frontend

- Customer support ticket page and navigation
- Worker support ticket page and navigation
- Admin support queue/workbench page and navigation
- feature reducers and API-backed mutation reload behavior in all three apps

### Tests and gates

- `tests/unit/supportTicketStateMachine.test.ts`
- `tests/contract/supportTicket.contract.test.ts`
- `tests/unit/phase24bSupportPages.test.tsx`
- `tests/integration/phase24bSupportTicket.test.ts`
- `tests/security/phase24bBoundaries.test.ts`
- `tests/e2e/phase24b-support-ticket.spec.ts`
- `scripts/check-phase24b-boundaries.ps1`
- `scripts/run-phase24b-migration-gate.mjs`
- `scripts/run-phase24b-gates.mjs`
- `.github/workflows/phase24b-support-ticket-gates.yml`

## Security and correctness invariants

1. Requesters cannot submit `source`, `requesterId`, `cityCode`, or enterprise identity in create bodies; identity is derived from the verified RequestContext.
2. Worker withdrawal tickets bind `relatedWorkerId` to the verified worker identity.
3. Requesters see only their own tickets and never receive internal-only events.
4. Admin/Operator mutations are city scoped; Auditor is read-only.
5. Every create/mutation is idempotent; a stale `expectedVersion` produces 409 without an event or Outbox fact.
6. Ticket state and append-only event are committed in one transaction; lifecycle facts use the existing Transactional Outbox.
7. Support does not directly mutate protected business-domain tables.

## Verification ledger

| Check | Result | Evidence |
|---|---|---|
| Contract tests | PASS | `supportTicket.contract.test.ts`: 6/6 |
| Component tests | PASS | `phase24bSupportPages.test.tsx`: 4/4 |
| State-machine tests | PASS | `supportTicketStateMachine.test.ts`: 2/2 |
| Integration/security | PASS | Support lifecycle 3/3; Phase 24B boundary 1/1 |
| Migration fresh/replay | PASS | Migration `047` removed from the migration ledger and reapplied successfully |
| Workspace typecheck/build | PASS | Typecheck 17/17 tasks; build 11/11 tasks |
| Browser E2E | PASS | Customer create → Admin resolve → Customer read: 1/1 |
| Phase 24B aggregate gate | PASS | `pnpm gate:phase24b`; critical dependency audit found no known vulnerabilities |
| Phase 24B changed-source lint | PASS | ESLint completed for all changed Support backend, contract/client, test, and three-app source paths |
| Full unit/contract regression | PASS | 136 files; 759 tests; one historical todo |
| Full database/security regression | PASS | 174 files; 494 tests |
| Architecture preflight | PASS | `pnpm preflight`, including all Phase 0–24B boundary checks |

The Phase 23B historical boundary gate initially identified the shared
`backend/src/events/eventIds.ts` as a later-phase runtime change. Support ticket
ID generation was moved into the Phase 24-owned ticket module; the Phase 23B
script, its security test, the full database/security suite, and preflight then
all passed without weakening the locked gate.

The repository-wide `pnpm lint` command still reports the pre-existing
`no-useless-escape` finding in `packages/api-client/src/createApiClient.ts:73`.
That file is unchanged by Phase 24B; the finding is recorded here rather than
expanding this phase into unrelated historical cleanup.

## Lock verification — feature branch

- Human Lock approval received on 2026-07-12.
- Feature commit: `3740d84`; legacy-gate compatibility commits: `659e481`,
  `87b6ea6`, `f5399af`, and `7fd45b2`.
- MySQL and Redis local containers were healthy; migration runner reported
  `SKIP 047_phase24b_support_ticket_mvp`, and the complete seed runner passed.
- `pnpm build`: 11/11 tasks passed.
- `pnpm typecheck`: 17/17 tasks passed.
- `pnpm test`: 174/174 files and 494/494 tests passed after all committed-file
  boundary checks were active.
- `pnpm gate:phase24b`: passed, including migration replay, authenticated
  lifecycle integration, persisted Customer → Admin → Customer Playwright flow,
  build/typecheck, and critical dependency audit.
- `pnpm preflight`: passed through Phase 24B, including ledger replay and
  immutability proof.
- Historical Phase 8J/8K/8L, Phase 9A–9E, Phase 11, and Phase 12 gates received
  exact later-phase allowlists for the Support files, Support tables, and
  migration 047. Their original forbidden terms and money-movement boundaries
  remain active.

## Lock readiness

Phase 24B implementation, human acceptance, and feature-branch Lock verification
are complete. The remaining Lock ceremony is the `--no-ff` main merge,
post-merge verification, Lock metadata commit, and tag creation. Phase 24C has
not been entered.
