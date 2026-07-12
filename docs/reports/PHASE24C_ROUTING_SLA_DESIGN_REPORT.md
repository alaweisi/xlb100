# Phase 24C — Routing / SLA / Agent Workbench Design Report

## Status

- Branch: `codex/phase24c-routing-sla-design`
- Base: locked Phase 24B metadata commit `6ac201a`
- Status: **PHASE 0 DESIGN APPROVED**
- Runtime changes: none
- Migration changes: none
- Human approval: received on 2026-07-12; Phase 1 entered on branch `codex/phase24c-phase1-agent-skill-groups`

## Parallel discovery

Three read-only investigations were completed:

1. Job execution: only the demo-oriented process `setInterval` auto-run exists;
   Outbox provides the repository's proven DB claim/lease pattern.
2. Identity and city authorization: Support agents must be business profiles
   over `admin_users` plus explicit `admin_city_scopes`, with current role
   revalidation on sensitive writes.
3. Locked Support behavior: group/SLA fields are currently read-only placeholders;
   assignment uses Admin user IDs, first response currently includes internal
   notes, and the default cursor cannot safely represent SLA ordering.

## Design outcome

The design selects:

- independent city-scoped agent, skill-group, membership, and SLA-policy tables;
- preservation of the locked `assignedAgentId = admin_users.id` meaning;
- deterministic type/language routing with a city fallback group;
- immutable SLA due-time snapshots for new tickets only;
- 24×7 elapsed-minute SLA without business-calendar or paused-clock claims;
- city/type/priority policies and a fixed one-step escalation ladder, without
  source-specific timing in this phase;
- explicit supervisor assignment plus server-derived public-pool claim CAS;
- DB-polled, multi-instance-safe SLA breach processing;
- versioned SLA cursors and mine/group/all workbench views;
- no realtime IM, bot, knowledge-base, CSAT, quality, or OA scope.

## Compatibility findings

- Migration 047 remains immutable.
- Historical NULL group/SLA values remain NULL.
- Historical first-response timestamps are not rewritten.
- Existing ungrouped tickets retain 24B free assignment.
- Support remains unable to mutate Phase 17, payment, dispatch, ledger,
  settlement, refund, payout, or worker-finance state.

## Design verification

- Three parallel read-only probes covered jobs/concurrency, Auth/city identity,
  and the locked Support ticket/API/workbench implementation.
- Two cross-review rounds checked database CHECK expansion, breach predicates,
  multi-instance claims, Admin identity semantics, language idempotency,
  mutation-time CAS, policy history, effective due time, pagination, and role
  compatibility.
- All blocking review findings were incorporated; the final reviewers reported
  no remaining blocking design issue.
- `git diff --check` passed, and no runtime, migration, API, package, test, or UI
  file was changed by Phase 0.

## Proposed execution slices

1. Phase 1: agent profiles, skill groups, membership, assignment validation.
2. Phase 2: automatic routing, SLA policies and immutable due snapshots.
3. Phase 3: SLA breach polling, public-pool claim, complete Admin workbench.

Each slice stops for independent verification and human acceptance. No slice is
implemented by this design task.

## Evidence

- Design: `docs/architecture/support-routing-sla-design.md`
- Locked ticket contract: `docs/contracts/CONTRACT_SUPPORT_TICKETS.md`
- Locked schema: `db/migrations/047_phase24b_support_ticket_mvp.sql`
- Job entry: `backend/src/jobs/autoRun.ts`
- Identity tables: migrations `001`, `028`, and `032`
- Current ticket module: `backend/src/support/ticket/`

## Exit condition

Stop after this report and request explicit approval of the ten decisions in
the design document. Do not create migration 048 or enter Phase 24C Phase 1
without that approval.
