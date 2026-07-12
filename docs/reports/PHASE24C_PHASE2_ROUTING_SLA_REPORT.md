# Phase 24C Phase 2 — Automatic Routing And SLA Policy Report

## Status

- Phase: Phase 24C Phase 2
- Status: IMPLEMENTATION VERIFIED — awaiting human acceptance — NOT LOCKED
- Branch: `codex/phase24c-phase2-routing-sla`
- Accepted baseline: Phase 24C Phase 1 commits `ddd2715`, `ff815f1`
- Lock/tag: none; this report does not authorize Phase 3

## Scope

- Append-only migration 049 for city SLA policy revisions and ticket routing language.
- Deterministic city/type/optional-language skill-group matching.
- SLA exact-policy, city fallback, and emergency fallback selection.
- Immutable skill-group and SLA due-time snapshots during new-ticket creation.
- Admin skill-group and SLA policy configuration through `@xlb/api-client`.

## Explicit exclusions

- No SLA breach polling, escalation job, breach marker, event, or Outbox fact.
- No public-pool claim, mine/pool queues, or Phase 3 workbench.
- No WebSocket, bot, knowledge base, quality, CSAT, or OA scope.
- No mutation of locked migrations 000–048 or protected business domains.

## Delivery files

- `db/migrations/049_phase24c_support_routing_sla_policies.sql`
- `backend/src/support/routing/` and the Phase 24B ticket-create extension
- `packages/types/src/support.ts`
- `packages/validators/src/supportSchema.ts`
- `packages/api-client/src/support.ts`
- `apps/admin/src/pages/SupportRoutingConfigPage.tsx`
- `apps/admin/src/pages/SupportTicketsPage.tsx`
- `docs/contracts/CONTRACT_SUPPORT_ROUTING.md`
- `docs/contracts/CONTRACT_SUPPORT_TICKETS.md`
- `tests/contract/phase24cRoutingSla.contract.test.ts`
- `tests/integration/phase24cRoutingSla.test.ts`
- `tests/unit/phase24cRoutingSlaAdminPage.test.tsx`
- `tests/security/phase24cPhase2Boundaries.test.ts`
- Phase 2 migration, aggregate, boundary, CI, and preflight gates

## Verification

- Phase 2 aggregate gate: passed.
- Contract: 4/4 passed.
- Integration: 3/3 passed, including deterministic routing precedence,
  language-neutral/default/NULL outcomes, exact/fallback/emergency SLA,
  immutable historical snapshots, idempotency conflicts, CAS conflicts,
  overlapping-window rejection, and mandatory fallback protection.
- Admin configuration UI: 3/3 passed.
- Security boundary: 1/1 passed.
- Migration 049 schema and re-execution: passed.
- Workspace typecheck: 17/17 tasks passed.
- Workspace build: 11/11 tasks passed.
- Critical dependency audit: no known vulnerabilities.
- Full regression: 178 files / 502 tests passed. The first two runs exposed one
  pre-existing Worker UI timing fluctuation and then two historical NULL-group
  fixture assumptions plus a Phase 1 historical-gate snapshot issue; the Worker
  file passed 18/18 alone, the real compatibility issues were corrected, and the
  final full run passed without failures.
- Complete architecture preflight: passed from committed Phase 2 state,
  including the Phase 1 historical snapshot gate and Phase 2 boundary gate.

## Acceptance boundary

Stop after Phase 2 delivery and request explicit human acceptance. Do not enter
Phase 3 and do not Lock Phase 24C automatically.
