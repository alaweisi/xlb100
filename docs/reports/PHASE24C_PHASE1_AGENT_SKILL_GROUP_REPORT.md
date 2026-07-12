# Phase 24C Phase 1 — Agent And Skill Group Report

## Status

- Branch: `codex/phase24c-phase1-agent-skill-groups`
- Base: approved Phase 24C Phase 0 design commit `35bae96`
- Status: **ACCEPTED BY HUMAN — NOT LOCKED**
- Migration: `048_phase24c_support_agents_skill_groups.sql`

## Scope

This slice activates the first part of the locked Phase 24C design:

- Support agent profiles bound to existing Admin/Operator identities and an
  explicit real-city scope;
- Support skill groups and same-city agent membership;
- Admin-managed versioned configuration APIs;
- skill-group-aware ticket assignment while preserving the locked
  `assignedAgentId = admin_users.id` meaning;
- legacy free assignment for tickets whose `assigned_skill_group_id` is NULL,
  with current database role and explicit city-scope validation.

## Boundary

Phase 1 does not implement automatic routing, SLA policies, ticket due-time
snapshots, SLA polling/escalation, public-pool claim, a new Admin page, realtime
IM, bot, knowledge base, quality, CSAT, OA, or any protected-domain mutation.
Migrations 000–047 and the Phase 24B tag remain immutable.

## Verification ledger

| Check | Result | Evidence |
|---|---|---|
| Migration schema/re-execution and locked 000–047 boundary | Passed | `pnpm test:migration:phase24c1` |
| Contract and validator alignment | Passed, 5/5 | `pnpm test:contract:phase24c1` |
| Agent/skill-group integration | Passed, 3/3 | real-MySQL API integration |
| Role/city/security rejection | Passed, 1/1 | Phase 1 boundary/security test |
| Skill-aware/legacy assignment | Passed | grouped rejection/success and ungrouped compatibility integration |
| Typecheck/build | Passed, 17/17 and 11/11 | `pnpm gate:phase24c1` |
| Critical dependency audit | Passed | no known critical vulnerabilities |
| Full regression | Passed, 176 files / 498 tests | `pnpm test` |
| Full architecture preflight | Passed | `pnpm preflight` including Phase 24C1 gate |
| Diff hygiene | Passed | `git diff --check` |

## Changed files

- Migration and dictionaries: `db/migrations/048_phase24c_support_agents_skill_groups.sql`,
  `db/dictionary/TABLES.md`, `db/dictionary/CITY_CODE_COLUMNS.md`.
- Backend: `backend/src/support/agentWorkbench/` plus Support module registration
  and the ticket assignment reference/service upgrade.
- Shared contract surface: `packages/types/src/support.ts`,
  `packages/validators/src/supportSchema.ts`, `packages/api-client/src/support.ts`,
  their barrel exports, and API client PATCH/DELETE transport support.
- Tests and gates: Phase 24C1 contract/integration/security tests, migration and
  aggregate gate scripts, CI workflow, package scripts, and architecture preflight
  integration. Historical Phase 9A–9E exact allowlists now register migration
  048, the Phase 24C boundary/report documents, and the Support-owned Phase 1
  repository paths; the Phase 12 per-module write policy now recognizes only
  the three new `support_*` tables in addition to the locked ticket tables.
- Documentation: `CONTRACT_SUPPORT_ROUTING.md`, Support module README,
  database dictionaries, this report, Phase 0 approval report, and
  `CURRENT_STATE.md`.

## Acceptance note

Human acceptance was received on 2026-07-12. Phase 24C remains intentionally
untagged and unlocked; Phase 2 automatic routing/SLA work entered on its own
feature branch after that approval.

## Exit condition

Stop after Phase 1 verification and request explicit human acceptance. Do not
enter Phase 24C Phase 2 automatic routing or SLA implementation in this slice.
